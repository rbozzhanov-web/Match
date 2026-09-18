import { Navigate, Route, Routes } from 'react-router-dom';

import { AppFrame } from './AppFrame';
import { MatchProvider } from './matchState';

export function AppRoutes() {
  return (
    <MatchProvider>
      <Routes>
        {/* Every primary tab renders the same frame: the pager holds all four pages at once, and
            the route only says which one is looked at. */}
        <Route element={<AppFrame />} path="/" />
        <Route element={<AppFrame />} path="/calendar" />
        <Route element={<AppFrame />} path="/people" />
        <Route element={<AppFrame />} path="/more" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </MatchProvider>
  );
}
