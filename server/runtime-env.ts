export const isProductionDeployment = process.env.LUDICORD_DEPLOYMENT_ENV === "production" ||
  process.env.NODE_ENV === "production";