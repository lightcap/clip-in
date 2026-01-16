// Content script that runs on members.onepeloton.com
// This script can access localStorage and communicates with the popup

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getToken') {
    const result = extractToken();
    sendResponse(result);
  }
  return true; // Keep message channel open for async response
});

// Extract the Peloton token from localStorage
function extractToken() {
  try {
    // Find the Auth0 token key
    const keys = Object.keys(localStorage);
    const auth0Key = keys.find(k =>
      k.includes('auth0spajs') && k.includes('api.onepeloton.com')
    );

    if (!auth0Key) {
      return { error: null, token: null, username: null };
    }

    const data = JSON.parse(localStorage.getItem(auth0Key));
    const token = data?.body?.access_token;
    const refreshToken = data?.body?.refresh_token;

    if (!token) {
      return { error: null, token: null, refreshToken: null, username: null };
    }

    // Try to get username from user data key
    let username = null;
    const userKey = keys.find(k => k.includes('auth0spajs') && k.includes('user'));
    if (userKey) {
      try {
        const userData = JSON.parse(localStorage.getItem(userKey));
        username = userData?.nickname || userData?.name || userData?.email;
      } catch (e) {
        // Ignore parsing errors for username
      }
    }

    return { error: null, token, refreshToken, username };
  } catch (e) {
    console.error('Clip In: Error extracting token:', e);
    return { error: 'Failed to read login data. Try refreshing the page.', token: null, username: null };
  }
}
