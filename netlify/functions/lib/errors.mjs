
export const API_ERRORS = {
  UNAUTHENTICATED: {
    status: 401,
    message: "Authentication required."
  },

  ACCOUNT_NOT_CONFIGURED: {
    status: 403,
    message: "Account is not configured."
  },

  ACCOUNT_DISABLED: {
    status: 403,
    message: "Account access is disabled."
  },

  INVALID_ROLE: {
    status: 403,
    message: "Account permissions are invalid."
  },

  FORBIDDEN: {
    status: 403,
    message: "Access denied."
  },

  NOT_FOUND: {
    status: 404,
    message: "Resource not found."
  },

  METHOD_NOT_ALLOWED: {
    status: 405,
    message: "Method not allowed."
  }
};
