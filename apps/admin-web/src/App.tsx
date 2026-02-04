import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './lib/session';
import AppRoutes from './routes';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </SessionProvider>
    </BrowserRouter>
  );
}

export default App;
