type DeploymentEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
};

export function isSeedLoginEnabled(
  environment: DeploymentEnvironment = process.env,
) {
  return (
    environment.NODE_ENV === "development" ||
    environment.NODE_ENV === "test" ||
    environment.VERCEL_ENV === "preview"
  );
}
