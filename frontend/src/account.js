export const SSO = 'https://auth.huyab.cfd';
export const PROFILE_API = '/api/me';
const hubRedirect = () => encodeURIComponent(location.origin + '/');
export const signInHref = () => `${SSO}/login?redirect_uri=${hubRedirect()}`;
export const signOutHref = () => `${SSO}/logout?redirect_uri=${hubRedirect()}`;
