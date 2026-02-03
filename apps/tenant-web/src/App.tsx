import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './lib/session';
import AppRoutes from './routes';

function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}

export default App;
