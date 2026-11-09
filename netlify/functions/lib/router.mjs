export class Router {
  constructor() {
    this.routes = [];
  }

  register(routesArray) {
    if (Array.isArray(routesArray)) {
      this.routes.push(...routesArray);
    }
  }

  async handle(event) {
    const httpMethod = event.httpMethod;
    let path = event.path || '/';

    // Normalize path by removing trailing slash if present (except root)
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    for (const route of this.routes) {
      if (route.method !== httpMethod && route.method !== 'ALL') {
        continue;
      }

      const match = this.matchPath(route.path, path);
      if (match.matched) {
        return await route.handler(event, match.params);
      }
    }

    return {
      statusCode: 404,
      body: {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cannot ${httpMethod} ${path}`
        }
      }
    };
  }

  matchPath(routePath, requestPath) {
    const paramNames = [];
    const regexPath = routePath.replace(/:([a-zA-Z0-9_]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    const regex = new RegExp(`^${regexPath}$`);
    const match = requestPath.match(regex);

    if (!match) {
      return { matched: false, params: {} };
    }

    const params = {};
    paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1]);
    });

    return { matched: true, params };
  }
}

export const router = new Router();
