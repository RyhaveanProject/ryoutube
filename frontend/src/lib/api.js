import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export function setAuthHeaders({ token, deviceId }) {
  if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete api.defaults.headers.common["Authorization"];
  if (deviceId) api.defaults.headers.common["X-Device-Id"] = deviceId;
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 409 && detail === "DEVICE_MISMATCH") {
      window.dispatchEvent(new CustomEvent("ryh:device-mismatch"));
    } else if (status === 401) {
      window.dispatchEvent(new CustomEvent("ryh:unauthorized"));
    }
    return Promise.reject(err);
  }
);
