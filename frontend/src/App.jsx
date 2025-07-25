import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { WebSocketProvider } from './contexts/WebSocketContext'
import Layout from './components/Layout'
import BridgeAndSwapPage from './pages/BridgeAndSwapPage'
import MonitoringPage from './pages/MonitoringPage'
import SubTransferPage from './pages/SubTransferPage'
import StableFixPage from './pages/StableFixPage'

function App() {
  return (
    <WebSocketProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/bridge_and_swap" replace />} />
          <Route path="/bridge_and_swap" element={<BridgeAndSwapPage />} />
          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="/subtransfer" element={<SubTransferPage />} />
          <Route path="/stablefix" element={<StableFixPage />} />
        </Routes>
      </Layout>
    </WebSocketProvider>
  )
}

export default App 