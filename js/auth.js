const GOOGLE_CLIENT_ID = '359460211465-2n4vi9hcrf94ltm2mdrc37dshgpr87ja.apps.googleusercontent.com';
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
