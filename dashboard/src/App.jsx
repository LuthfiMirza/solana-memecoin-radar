import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardLayout } from './layouts/DashboardLayout';
import { OverviewPage } from './pages/OverviewPage';
import { MarketScannerPage } from './pages/MarketScannerPage';
import { SignalsPage } from './pages/SignalsPage';
import { PortfolioPage } from './pages/PortfolioPage';
export default function App() { return <Routes><Route element={<DashboardLayout />}><Route index element={<OverviewPage />} /><Route path="scanner" element={<MarketScannerPage />} /><Route path="signals" element={<SignalsPage />} /><Route path="portfolio" element={<PortfolioPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Route></Routes>; }
