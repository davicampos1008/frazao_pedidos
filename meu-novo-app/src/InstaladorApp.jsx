import React, { useState, useEffect } from 'react';

export default function InstaladorApp() {
  const [eventoInstalacao, setEventoInstalacao] = useState(null);
  const [permissaoNotificacao, setPermissaoNotificacao] = useState(Notification.permission);

  // Captura o evento que o navegador dispara quando percebe que o site é um App instalável
  useEffect(() => {
    const escutarInstalacao = (e) => {
      e.preventDefault();
      setEventoInstalacao(e);
    };
    window.addEventListener('beforeinstallprompt', escutarInstalacao);
    return () => window.removeEventListener('beforeinstallprompt', escutarInstalacao);
  }, []);

  // Função do Botão de Instalar
  const instalarApp = async () => {
    if (!eventoInstalacao) {
      alert("Para instalar no iPhone: Toque no botão de Compartilhar do Safari e escolha 'Adicionar à Tela de Início'.");
      return;
    }
    eventoInstalacao.prompt();
    const { outcome } = await eventoInstalacao.userChoice;
    if (outcome === 'accepted') {
      setEventoInstalacao(null);
    }
  };

  // Função do Botão de Notificações
  const ativarNotificacoes = async () => {
    if (!("Notification" in window)) {
      alert("Este navegador não suporta notificações de área de trabalho.");
      return;
    }

    const permissao = await Notification.requestPermission();
    setPermissaoNotificacao(permissao);

    if (permissao === "granted") {
      new Notification("🍎 Frazão Frutas & Cia", {
        body: "Notificações ativadas com sucesso! Você receberá os alertas do sistema aqui.",
        icon: "/logo.png"
      });
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', maxWidth: '400px', margin: '20px auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#111' }}>📱 Configurações do App</h3>
        <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Melhore sua experiência usando o aplicativo nativo.</p>
      </div>

      {/* Botão de Instalar na Tela Inicial */}
      <button 
        onClick={instalarApp} 
        style={{ padding: '15px', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
      >
        📥 ADICIONAR APP À TELA INICIAL
      </button>

      {/* Botão de Notificações */}
      <button 
        onClick={ativarNotificacoes} 
        disabled={permissaoNotificacao === 'granted'}
        style={{ padding: '15px', backgroundColor: permissaoNotificacao === 'granted' ? '#dcfce7' : '#3b82f6', color: permissaoNotificacao === 'granted' ? '#166534' : '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: permissaoNotificacao === 'granted' ? 'default' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
      >
        {permissaoNotificacao === 'granted' ? '🔔 NOTIFICAÇÕES ATIVAS' : '🔔 ATIVAR NOTIFICAÇÕES'}
      </button>

    </div>
  );
}