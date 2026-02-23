import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // Importando o cozinheiro

// Aqui a gente diz ao navegador para pegar a 'div' com id 'root' lá no index.html
const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("Erro Crítico: Não encontrei a div 'root' no seu index.html!");
}