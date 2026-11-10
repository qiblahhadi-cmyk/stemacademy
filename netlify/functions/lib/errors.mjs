
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

  PASSWORD_CHANGE_REQUIRED: {
    status: 403,
    message: "Change your initial password before continuing."
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
  },

  INVALID_INPUT: {
    status: 400,
    message: "The request is invalid."
  },

  CONFLICT: {
    status: 409,
    message: "The requested change conflicts with the current record state."
  }
};
