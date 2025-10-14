/*This file renders the react app 'App' inside the HTML element <root>,
and in AuthProvider to automatically update login*/

import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import {AuthProvider} from './context/AuthProvider';

ReactDOM.render(
  <React.StrictMode>
      <AuthProvider>
          <App />
      </AuthProvider>
  </React.StrictMode>,
    document.getElementById('root')
);