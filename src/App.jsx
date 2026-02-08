import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { RoomProvider } from './context/RoomContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './Layout';
import Landing from './pages/Landing';
import CreateRoom from './pages/CreateRoom';
import JoinRoom from './pages/JoinRoom';
import Room from './pages/Room';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Account from './pages/Account';
import './index.css';

import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/ToastContainer';

function App() {
  console.log('App rendering...');
  return (
    <Router>
      <ToastProvider>
        <AuthProvider>
          <RoomProvider>
            <ToastContainer />
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/create" element={<CreateRoom />} />
                <Route path="/join" element={<JoinRoom />} />
                <Route path="/room/:roomId" element={<Room />} />
              </Route>
            </Routes>
          </RoomProvider>
        </AuthProvider>
      </ToastProvider>
    </Router>

  );
}

export default App;
