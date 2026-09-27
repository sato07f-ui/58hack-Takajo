import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { startTunnelLog } from './utils/debug/tunnelLog' // [tunnel]
import { startDevKeepAlive } from './utils/debug/devKeepAlive' // [keepalive]

startTunnelLog() // [tunnel]
startDevKeepAlive() // [keepalive]

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
