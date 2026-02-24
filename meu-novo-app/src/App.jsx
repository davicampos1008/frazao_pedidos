import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import Lojas from './Lojas';
import Usuarios from './Usuarios';
import Fornecedores from './Fornecedores';
import Produtos from './Produtos'; 
import Precificacao from './Precificacao';
import MenuCliente from './MenuCliente';
import Marketing from './Marketing'; 
import Listas from './Listas';
import PlanilhaCompras from './PlanilhaCompras';
import FechamentoLojas from './FechamentoLojas';

function App() {
  // 💡 TEMA CLARO E ESCURO SALVO NA MEMÓRIA
  const [tema, setTema] = useState(() => localStorage.getItem('temaVIRTUS') || 'claro');
  const isEscuro = tema === 'escuro';

  useEffect(() => {
    localStorage.setItem('temaVIRTUS', tema);
  }, [tema]);

  const config = {
    identidade: {
      corDestaque: '#f97316',
      corFundoApp: isEscuro ? '#121212' : '#f5f5f4',
      corMenuLateral: isEscuro ? '#0a0a0a' : '#111111',
      corCard: isEscuro ? '#1e1e1e' : '#ffffff',
      corTexto: isEscuro ? '#f1f5f9' : '#111111',
      corTextoSecundario: isEscuro ? '#94a3b8' : '#666666',
      fontePrincipal: 'sans-serif',
      raioBordaPadrao: '15px'
    },
    menu: { largura: '280px', paddingInterno: '80px 20px', corTexto: '#ffffff', corSair: '#ef4444', tamanhoIcone: '18px', espacamentoItens: '10px' }
  };

  const [usuarioLogado, setUsuarioLogado] = useState(null);
  
  // 💡 MEMÓRIA DA ÚLTIMA TELA
  const [telaAtiva, setTelaAtiva] = useState(() => localStorage.getItem('telaAtivaVIRTUS') || 'inicio');
  const [menuAberto, setMenuAberto] = useState(false);

  // 💡 ESTADOS PWA E NOTIFICAÇÃO (APP)
  const [permissaoPush, setPermissaoPush] = useState('default');
  const [eventoInstalacao, setEventoInstalacao] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const usuarioSalvo = localStorage.getItem('usuarioVIRTUS');
    if (usuarioSalvo) {
      const dadosUsuario = JSON.parse(usuarioSalvo);
      setUsuarioLogado(dadosUsuario);
      // Só direciona pro inicio/cliente se não houver memória da última tela
      if (!localStorage.getItem('telaAtivaVIRTUS')) {
         setTelaAtiva(dadosUsuario.perfil === 'admin' ? 'inicio' : 'cliente');
      }
    }

    // Verifica se já está instalado (Modo Standalone)
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);

    if ("Notification" in window) setPermissaoPush(Notification.permission);

    const escutarInstalacao = (e) => {
      e.preventDefault();
      setEventoInstalacao(e);
    };
    window.addEventListener('beforeinstallprompt', escutarInstalacao);
    return () => window.removeEventListener('beforeinstallprompt', escutarInstalacao);
  }, []);

  // 💡 SALVA A TELA SEMPRE QUE MUDAR
  useEffect(() => {
    localStorage.setItem('telaAtivaVIRTUS', telaAtiva);
  }, [telaAtiva]);

  const instalarApp = async () => {
    if (eventoInstalacao) {
      eventoInstalacao.prompt();
      const { outcome } = await eventoInstalacao.userChoice;
      if (outcome === 'accepted') setEventoInstalacao(null);
    } else {
      alert("📲 Para instalar no iPhone: Toque no botão de Compartilhar (quadradinho com seta) e escolha 'Adicionar à Tela de Início'.\n\nNo Android, acesse pelo Google Chrome e procure 'Adicionar à tela inicial'.");
    }
  };

  const solicitarPermissaoPush = async () => {
    if ("Notification" in window) {
      const permissao = await Notification.requestPermission();
      setPermissaoPush(permissao);
      if (permissao === "granted") alert("🔔 Notificações ativadas com sucesso!");
    }
  };

  async function realizarLogin(codigo, senha) {
    const { data, error } = await supabase.from('usuarios').select('*').eq('codigo', codigo).eq('senha', senha).single();
    if (error || !data) return alert('Código ou Senha inválidos!');
    if (data.status === false) return alert('⛔ ACESSO NEGADO: Usuário desativado pelo administrador.');
    
    localStorage.setItem('usuarioVIRTUS', JSON.stringify(data));
    setUsuarioLogado(data);
    setTelaAtiva(data.perfil === 'admin' ? 'inicio' : 'cliente');
  }

  const fazerLogout = () => {
    if(window.confirm("Sair do sistema?")) {
      localStorage.removeItem('usuarioVIRTUS');
      localStorage.removeItem('telaAtivaVIRTUS'); // Limpa a memória da tela ao sair
      setUsuarioLogado(null);
      setTelaAtiva('inicio');
      setMenuAberto(false);
    }
  };

  if (!usuarioLogado) return <Login aoLogar={realizarLogin} />;

  const saudacaoPorHorario = () => {
    const hora = new Date().getHours();
    if (hora < 12) return 'BOM DIA';
    if (hora < 18) return 'BOA TARDE';
    return 'BOA NOITE';
  };

  const renderBadgePerfil = (perfil) => {
    if (perfil === 'admin') return <span style={{ backgroundColor: '#111', color: '#fff', padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '900', letterSpacing: '1px' }}>🛡️ ADMINISTRADOR</span>;
    return <span style={{ backgroundColor: '#f1f5f9', color: '#64748b', padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '900', letterSpacing: '1px' }}>👤 OPERADOR</span>;
  };

  const navegarPara = (telaDestino) => {
    if (telaDestino !== 'precificacao' && window.VIRTUS_PENDENCIAS > 0) {
      const confirma = window.confirm(`⚠️ AVISO DE SEGURANÇA:\nVocê tem ${window.VIRTUS_PENDENCIAS} produtos pendentes na cotação.\n\nDeseja abandonar a cotação e trocar de tela mesmo assim?`);
      if (!confirma) return; 
    }
    setTelaAtiva(telaDestino);
    setMenuAberto(false);
  };

  const s = {
    btnNav: { background: 'none', border: 'none', color: config.menu.corTexto, textAlign: 'left', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold', padding: '12px 0', fontFamily: config.identidade.fontePrincipal }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: config.identidade.corFundoApp, overflow: 'hidden', fontFamily: config.identidade.fontePrincipal, transition: 'background-color 0.3s' }}>
      
      {/* BOTÃO DE MENU */}
      <button onClick={() => setMenuAberto(!menuAberto)} style={{ position: 'fixed', top: '20px', left: '20px', zIndex: 10000, backgroundColor: config.identidade.corDestaque, color: 'white', border: 'none', width: '50px', height: '50px', borderRadius: '12px', fontSize: '28px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
        {menuAberto ? '✕' : '⋮'}
      </button>

      {/* MENU LATERAL */}
      {menuAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '280px', height: '100%', backgroundColor: config.identidade.corMenuLateral, color: 'white', padding: '80px 20px 30px 20px', zIndex: 9999, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '10px 0 40px rgba(0,0,0,0.6)', transition: 'background-color 0.3s' }}>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', paddingRight: '10px', paddingBottom: '80px' }}>
            <p style={{ fontSize: '10px', color: '#666', fontWeight: '900', letterSpacing: '1px' }}>NAVEGAÇÃO</p>
            <button onClick={() => navegarPara('inicio')} style={s.btnNav}>🏠 INÍCIO</button>
            <button onClick={() => navegarPara('cliente')} style={s.btnNav}>📱 APP COMPRAS</button>
            
            {usuarioLogado.perfil === 'admin' && (
              <>
                <hr style={{ border: '0.5px solid #333', margin: '10px 0' }} />
                <p style={{ fontSize: '10px', color: config.identidade.corDestaque, fontWeight: '900', letterSpacing: '1px' }}>ADMINISTRAÇÃO</p>
                <button onClick={() => navegarPara('lojas')} style={s.btnNav}>🏪 GESTÃO DE LOJAS</button>
                <button onClick={() => navegarPara('usuarios')} style={s.btnNav}>👥 GESTÃO DE USUÁRIOS</button>
                <button onClick={() => navegarPara('fornecedores')} style={s.btnNav}>📦 FORNECEDORES</button>
                <button onClick={() => navegarPara('produtos')} style={s.btnNav}>🍎 GESTÃO DE PRODUTOS</button>
                <button onClick={() => navegarPara('precificacao')} style={s.btnNav}>💲 COTAÇÃO DIÁRIA</button>
                <button onClick={() => navegarPara('marketing')} style={s.btnNav}>🖼️ BANNERS E MÍDIA</button>
                <button onClick={() => navegarPara('listas')} style={s.btnNav}>📋 CONFERIR LISTAS</button>
                <button onClick={() => navegarPara('compras')} style={s.btnNav}>🛒 PLANILHA DE COMPRAS</button>
                <button onClick={() => navegarPara('fechamento')} style={s.btnNav}>🧾 FECHAMENTO DE LOJAS</button>
              </>
            )}
          </div>

          <div style={{ paddingTop: '20px', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            {/* 💡 CHAVE DE TEMA DIA E NOITE */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isEscuro ? '#1e1e1e' : '#333', padding: '10px 15px', borderRadius: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>TEMA</span>
              <button onClick={() => setTema(isEscuro ? 'claro' : 'escuro')} style={{ background: isEscuro ? '#333' : '#f8fafc', color: isEscuro ? '#fff' : '#111', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {isEscuro ? '☀️ DIA' : '🌙 NOITE'}
              </button>
            </div>

            <button onClick={fazerLogout} style={{ width: '100%', backgroundColor: '#ef4444', color: 'white', padding: '15px', borderRadius: '12px', border: 'none', fontWeight: '900', cursor: 'pointer' }}>
              🚪 SAIR DO APP
            </button>
          </div>
        </div>
      )}

      {/* CAIXA DE ROLAGEM MESTRE */}
      <div style={{ width: '100%', height: '100%', paddingTop: '100px', paddingBottom: '150px', paddingLeft: '15px', paddingRight: '15px', overflowY: 'auto', boxSizing: 'border-box', zIndex: 1 }}>
        
        {telaAtiva === 'inicio' && (
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', backgroundColor: config.identidade.corCard, padding: '50px', borderRadius: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', transition: 'all 0.3s' }}>
            <p style={{ color: config.identidade.corTextoSecundario, fontSize: '12px', fontWeight: 'bold', margin: 0 }}>{saudacaoPorHorario()}</p>
            <h1 style={{ fontWeight: '900', color: config.identidade.corTexto, margin: 0, fontSize: '32px' }}><span style={{ color: config.identidade.corDestaque }}>{usuarioLogado.nome.toUpperCase()}</span></h1>
            <div style={{ marginTop: '5px' }}>{renderBadgePerfil(usuarioLogado.perfil)}</div>
            <hr style={{ width: '50px', border: `2px solid ${config.identidade.corDestaque}`, borderRadius: '10px', margin: '15px 0' }} />
            <p style={{ color: config.identidade.corTextoSecundario, fontWeight: 'bold', margin: 0, marginBottom: '20px' }}>Frazão Frutas & CIA</p>
            
            <button onClick={() => setTelaAtiva('cliente')} style={{ backgroundColor: '#111', color: 'white', border: 'none', padding: '15px 30px', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize: '12px' }}>
              📱 ABRIR APP DE PEDIDOS
            </button>

            {/* 💡 BOTÕES PWA E PUSH NA HOME ADMIN (OCULTAM SE ATIVADOS) */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {!isStandalone && (
                <button onClick={instalarApp} style={{ background: config.identidade.corDestaque, color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '10px', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  📥 INSTALAR APP NA TELA
                </button>
              )}
              {permissaoPush === 'default' && (
                <button onClick={solicitarPermissaoPush} style={{ background: isEscuro ? '#333' : '#fef3c7', color: isEscuro ? '#fbbf24' : '#d97706', border: 'none', padding: '10px 15px', borderRadius: '10px', fontSize: '11px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  🔔 ATIVAR NOTIFICAÇÕES
                </button>
              )}
            </div>
          </div>
        )}

        {/* COMPONENTES CARREGADOS (Passando o Tema para o App Cliente) */}
        {telaAtiva === 'lojas' && <Lojas setTelaAtiva={setTelaAtiva} />}
        {telaAtiva === 'usuarios' && <Usuarios />}
        {telaAtiva === 'fornecedores' && <Fornecedores />}
        {telaAtiva === 'produtos' && <Produtos />}
        {telaAtiva === 'precificacao' && <Precificacao setTelaAtiva={setTelaAtiva} />}
        {telaAtiva === 'marketing' && <Marketing />}
        {telaAtiva === 'listas' && <Listas/>} 
        {telaAtiva === 'cliente' && usuarioLogado && <MenuCliente usuario={usuarioLogado} tema={tema} />}
        {telaAtiva === 'compras' && <PlanilhaCompras />}
        {telaAtiva === 'fechamento' && <FechamentoLojas />}
      </div>
    </div>
  );
}

export default App;