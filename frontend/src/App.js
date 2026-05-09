import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export function setAuthHeaders({ token, deviceId }) {
  if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete api.defaults.headers.common["Authorization"];
  if (deviceId) api.defaults.headers.common["X-Device-Id"] = deviceId;
}

// 401 detail strings raised by /api/youtube/me/* endpoints when the user has
// NOT linked their YouTube account (or the link expired). These must NOT log
// the app user out — they only mean "YouTube integration not available".
const YT_INTEGRATION_401 = new Set([
  "YouTube not connected",
  "YouTube not linked",
  "YouTube auth required",
]);

function _isYouTubeIntegrationUrl(url = "") {
  // Don't include /api/youtube/auth/* here — auth/exchange uses its own axios.
  // We specifically want to skip session-kill for per-user YT data endpoints.
  return /\/youtube\/(me|auth\/(status|disconnect|url))(\/|$|\?)/.test(url);
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    const url = err?.config?.url || "";
    if (status === 409 && detail === "DEVICE_MISMATCH") {
      window.dispatchEvent(new CustomEvent("ryh:device-mismatch"));
    } else if (status === 401) {
      // CRITICAL FIX: a 401 from a YouTube-integration endpoint (e.g. the
      // user hasn't linked their YouTube account, or the linked token was
      // revoked) must NOT clear the app session. Previously every 401
      // dispatched ryh:unauthorized, which deleted the app's bearer token
      // and bounced the user back to /login immediately after they had
      // just successfully signed in or connected their YouTube account.
      const isYTIntegration =
        _isYouTubeIntegrationUrl(url) || YT_INTEGRATION_401.has(detail);
      if (!isYTIntegration) {
        window.dispatchEvent(new CustomEvent("ryh:unauthorized"));
      }
    }
    return Promise.reject(err);
  }
);
