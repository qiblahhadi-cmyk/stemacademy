/* Shared in-memory Firestore stand-in for unit tests. Not used in production. */
/*
 * In-memory stand-in for the Firestore Admin API surface used by the module.
 * It supports ==, in, >= and <= filters; any other operator throws so that an
 * unsupported query cannot pass silently. orderBy/startAfter are honoured when
 * used (document ID is the implicit tiebreak), but index requirements are not
 * enforced, so these tests do not prove index behaviour; firestore.indexes.json
 * is checked separately.
 */
export function createFakeDb(seed = {}) {
  const store = new Map();
  const versions = new Map();
  let counter = 0;
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  // Yield to the event loop so concurrent requests can interleave between
  // reads and writes, as they would against a real server.
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const versionOf = (key) => versions.get(key) ?? 0;
  const bump = (key) => versions.set(key, versionOf(key) + 1);

  for (const [collection, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs)) {
      store.set(`${collection}/${id}`, clone(data));
      bump(`${collection}/${id}`);
    }
  }

  const docsOf = (collection) => [...store.entries()]
    .filter(([key]) => key.startsWith(`${collection}/`))
    .map(([key, data]) => ({ id: key.slice(collection.length + 1), data }));

  function docRef(collection, id) {
    return {
      col: collection,
      id,
      async get() {
        await tick();
        const data = store.get(`${collection}/${id}`);
        return { id, exists: data !== undefined, data: () => clone(data) };
      },
      async set(data) {
        applyWrite({ key: `${collection}/${id}`, data: clone(data) });
      }
    };
  }

  // Comparable form for ordering and range filters: Dates become ISO strings.
  const comparable = (value) => (value instanceof Date ? value.toISOString() : value);

  function query(collection, filters = [], limitN = null, order = null, after = null) {
    return {
      collection,
      where(field, op, value) {
        if (!["==", "in", ">=", "<="].includes(op)) throw new Error(`Fake db does not support ${op}`);
        return query(collection, [...filters, { field, op, value }], limitN, order, after);
      },
      orderBy(field, direction = "asc") {
        return query(collection, filters, limitN, { field, direction }, after);
      },
      startAfter(snapshot) {
        if (!order) throw new Error("Fake db startAfter requires orderBy");
        return query(collection, filters, limitN, order, snapshot.id);
      },
      limit(n) {
        return query(collection, filters, n, order, after);
      },
      async get() {
        await tick();
        const matches = (f, actual) => {
          if (f.op === "in") return f.value.includes(actual);
          if (f.op === ">=") return actual !== undefined && comparable(actual) >= comparable(f.value);
          if (f.op === "<=") return actual !== undefined && comparable(actual) <= comparable(f.value);
          return actual === f.value;
        };
        let matched = docsOf(collection).filter((doc) =>
          filters.every((f) => matches(f, doc.data[f.field]))
        );
        if (order) {
          // Mirrors Firestore: the document ID is the implicit final sort key,
          // in the same direction as the last explicit ordering.
          const sign = order.direction === "desc" ? -1 : 1;
          matched.sort((a, b) => {
            const x = comparable(a.data[order.field]);
            const y = comparable(b.data[order.field]);
            if (x < y) return -1 * sign;
            if (x > y) return 1 * sign;
            return a.id < b.id ? -1 * sign : a.id > b.id ? 1 * sign : 0;
          });
          if (after !== null) {
            const index = matched.findIndex((doc) => doc.id === after);
            matched = index === -1 ? [] : matched.slice(index + 1);
          }
        }
        if (limitN) matched = matched.slice(0, limitN);
        return {
          empty: matched.length === 0,
          docs: matched.map((doc) => ({ id: doc.id, data: () => clone(doc.data) }))
        };
      }
    };
  }

  return {
    store,
    updateDocument(collection, id, patch) {
      const key = `${collection}/${id}`;
      if (!store.has(key)) throw new Error("Document does not exist");
      store.set(key, { ...store.get(key), ...clone(patch) });
      bump(key);
    },
    beforeNextCommit: null,
    collection(collection) {
      return {
        ...query(collection),
        doc(id) {
          return docRef(collection, id ?? `gen-${++counter}`);
        }
      };
    },
    batch() {
      const ops = [];
      const batch = {
        set(ref, data) {
          ops.push({ key: `${ref.col}/${ref.id}`, data: clone(data) });
          return batch;
        },
        update(ref, patch) {
          const key = `${ref.col}/${ref.id}`;
          if (!store.has(key)) throw new Error("Document does not exist");
          ops.push({ key, patch: clone(patch) });
          return batch;
        },
        async commit() {
          for (const op of ops) applyWrite(op);
        }
      };
      return batch;
    },

    /**
     * Optimistic transaction: reads record document versions; writes are buffered
     * and applied only if no read document changed before commit. On conflict the
     * callback is retried, matching Firestore Admin SDK behaviour.
     */
    async runTransaction(callback) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const reads = new Map();
        const writes = [];
        const tx = {
          async get(ref) {
            await tick();
            if (ref && typeof ref.get === "function" && !ref.col) {
              const snapshot = await ref.get();
              for (const doc of snapshot.docs) {
                const key = `${ref.collection}/${doc.id}`;
                reads.set(key, versionOf(key));
              }
              return snapshot;
            }
            const key = `${ref.col}/${ref.id}`;
            reads.set(key, versionOf(key));
            const data = store.get(key);
            return { id: ref.id, exists: data !== undefined, data: () => clone(data) };
          },
          set(ref, data) {
            writes.push({ key: `${ref.col}/${ref.id}`, data: clone(data) });
            return tx;
          },
          update(ref, patch) {
            writes.push({ key: `${ref.col}/${ref.id}`, patch: clone(patch) });
            return tx;
          }
        };

        const result = await callback(tx);
        if (typeof this.beforeNextCommit === "function") {
          const mutate = this.beforeNextCommit;
          this.beforeNextCommit = null;
          mutate();
        }

        const conflict = [...reads].some(([key, version]) => versionOf(key) !== version);
        if (conflict) continue;

        writes.forEach(applyWrite);
        return result;
      }
      throw new Error("Transaction aborted after repeated conflicts");
    }
  };

  function applyWrite(op) {
    if (op.patch) {
      if (!store.has(op.key)) throw new Error("Document does not exist");
      store.set(op.key, { ...store.get(op.key), ...op.patch });
    } else {
      store.set(op.key, op.data);
    }
    bump(op.key);
  }
}
