// Google Sign-in client for this dashboard. Lives in its OWN GCP project, 'IK Hiring Dashboard'
// (ik-hiring-dashboard-506305), audience Internal so only @interviewkickstart.com accounts can sign in.
// Authorised origins: https://hiring.interviewkickstart.com + https://hiring-dashboard-phi.vercel.app.
// Replaced the old client (359460211465-...) on 2026-08-22: that one sat in the unrelated 'Data Sync for
// Burhan' project, had no consent screen configured, and so could not be edited to add the custom domain
// - which is what produced Error 400: origin_mismatch on hiring.interviewkickstart.com.
const GOOGLE_CLIENT_ID = '1099393636246-1tbpdlecqin1mhglup1bnuarv2kdm8bu.apps.googleusercontent.com';
const ALLOWED_DOMAIN = 'interviewkickstart.com';

let currentUser = null;

export function initAuth(onSuccess, onFailure) {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (response) => handleCredentialResponse(response, onSuccess, onFailure),
    hosted_domain: ALLOWED_DOMAIN,
  });

  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    { theme: 'outline', size: 'large', width: 280 }
  );
}

function handleCredentialResponse(response, onSuccess, onFailure) {
  const payload = decodeJwt(response.credential);

  if (!payload.email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    onFailure('Please sign in with your @interviewkickstart.com account.');
    return;
  }

  currentUser = {
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    token: response.credential,
  };

  sessionStorage.setItem('user', JSON.stringify(currentUser));
  onSuccess(currentUser);
}

export function getStoredUser() {
  const stored = sessionStorage.getItem('user');
  if (stored) {
    currentUser = JSON.parse(stored);
    return currentUser;
  }
  return null;
}

export function signOut() {
  currentUser = null;
  sessionStorage.removeItem('user');
  google.accounts.id.disableAutoSelect();
  window.location.reload();
}

export function getCurrentUser() {
  return currentUser;
}

function decodeJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64).split('').map(c =>
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join('')
  );
  return JSON.parse(jsonPayload);
}
