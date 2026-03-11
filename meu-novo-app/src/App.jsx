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
import PainelNotasFiscais from './PainelNotasFiscais';
import ConferenciaMadrugada from './ConferenciaMadrugada'; // 💡 IMPORT NOVO

function App() {
  const [tema, setTema] = useState(() => localStorage.getItem('temaVIRTUS') || 'claro');
  const isEscuro = tema === 'escuro';

  useEffect(() => {
    localStorage.setItem('temaVIRTUS', tema);
  }, [tema]);

  const config = {
    identidade: {
      corDestaque: '#f97316',
      corFundoApp: isEscuro ? '#0f172a' : '#f5f5f4', 
      corMenuLateral: isEscuro ? '#020617' : '#111111',
      corCard: isEscuro ? '#1e293b' : '#ffffff', 
      corTexto: isEscuro ? '#f8fafc' : '#111111',
      corTextoSecundario: isEscuro ? '#94a3b8' : '#666666',
      fontePrincipal: 'sans-serif',
      raioBordaPadrao: '15px'
    },
    menu: { largura: '280px', paddingInterno: '80px 20px', corTexto: '#ffffff', corSair: '#ef4444', tamanhoIcone: '18px', espacamentoItens: '10px' }
  };

  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [telaAtiva, setTelaAtiva] = useState('inicio');
  const [menuAberto, setMenuAberto] = useState(false);

  const [permissaoPush, setPermissaoPush] = useState('default');
  const [eventoInstalacao, setEventoInstalacao] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);

  const [modalConfiguracoesAberto, setModalConfiguracoesAberto] = useState(false);
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [modalNotificacoesAberto, setModalNotificacoesAberto] = useState(false);
  const [dadosSenha, setDadosSenha] = useState({ antiga: '', nova: '', confirma: '' });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');
  const [carregandoSenha, setCarregandoSenha] = useState(false);
  const [historicoNotificacoes, setHistoricoNotificacoes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('historico_notif_virtus')) || []; } catch(e) { return []; }
  });

  useEffect(() => {
    const usuarioSalvo = localStorage.getItem('usuarioVIRTUS');
    if (usuarioSalvo) {
      const dadosUsuario = JSON.parse(usuarioSalvo);
      setUsuarioLogado(dadosUsuario);
      
      const ultimaTela = sessionStorage.getItem('telaAtivaVIRTUS');
      let telaPadrao = 'cliente';
      if (dadosUsuario.perfil === 'admin') telaPadrao = 'inicio';
      else if (dadosUsuario.perfil === 'faturista') telaPadrao = 'notas_fiscais';

      const telaInicial = ultimaTela || telaPadrao;
      setTelaAtiva(telaInicial);
      
      if (!window.history.state || window.history.state.tela !== telaInicial) {
         window.history.replaceState({ tela: telaInicial }, '', '');
      }
    }

    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);
    if ("Notification" in window) setPermissaoPush(Notification.permission);

    const escutarInstalacao = (e) => {
      e.preventDefault();
      setEventoInstalacao(e);
    };
    window.addEventListener('beforeinstallprompt', escutarInstalacao);
    
    const lidarComVoltar = (e) => {
      if (e.state && e.state.tela) {
        setTelaAtiva(e.state.tela);
        sessionStorage.setItem('telaAtivaVIRTUS', e.state.tela);
      } else {
        const telaBase = usuarioLogado?.perfil === 'admin' ? 'inicio' : (usuarioLogado?.perfil === 'faturista' ? 'notas_fiscais' : 'cliente');
        if (telaAtiva !== 'inicio' && telaAtiva !== 'cliente' && telaAtiva !== 'notas_fiscais') {
           setTelaAtiva(telaBase);
           sessionStorage.setItem('telaAtivaVIRTUS', telaBase);
           window.history.replaceState({ tela: telaBase }, '', '');
        }
      }
    };
    window.addEventListener('popstate', lidarComVoltar);

    return () => {
      window.removeEventListener('beforeinstallprompt', escutarInstalacao);
      window.removeEventListener('popstate', lidarComVoltar);
    };
  }, [telaAtiva, usuarioLogado]);

  const instalarApp = async () => {
    if (eventoInstalacao) {
      eventoInstalacao.prompt();
      const { outcome } = await eventoInstalacao.userChoice;
      if (outcome === 'accepted') setEventoInstalacao(null);
    } else {
      alert("📲 Para instalar: Toque em Compartilhar e escolha 'Adicionar à Tela de Início' (iPhone) ou procure no menu do Chrome (Android).");
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
    const telaIr = data.perfil === 'admin' ? 'inicio' : (data.perfil === 'faturista' ? 'notas_fiscais' : 'cliente');
    setTelaAtiva(telaIr);
    sessionStorage.setItem('telaAtivaVIRTUS', telaIr);
    window.history.replaceState({ tela: telaIr }, '', '');
  }

  const fazerLogout = () => {
    if(window.confirm("Sair do sistema?")) {
      localStorage.removeItem('usuarioVIRTUS');
      sessionStorage.removeItem('telaAtivaVIRTUS'); 
      setUsuarioLogado(null);
      setTelaAtiva('inicio');
      setMenuAberto(false);
    }
  };

  const navegarPara = (telaDestino) => {
    if (telaDestino !== 'precificacao' && window.VIRTUS_PENDENCIAS > 0) {
      const confirma = window.confirm(`⚠️ AVISO DE SEGURANÇA:\nVocê tem ${window.VIRTUS_PENDENCIAS} produtos pendentes na cotação.\n\nDeseja abandonar a cotação e trocar de tela mesmo assim?`);
      if (!confirma) return; 
    }
    
    if (telaAtiva !== telaDestino) {
        window.history.pushState({ tela: telaDestino }, '', '');
    }

    setTelaAtiva(telaDestino);
    sessionStorage.setItem('telaAtivaVIRTUS', telaDestino);
    setMenuAberto(false);
    window.scrollTo(0,0);
  };

  const salvarNovaSenha = async () => {
    if(!dadosSenha.antiga || !dadosSenha.nova || !dadosSenha.confirma) return setErroSenha("Preencha todos os campos.");
    if(dadosSenha.nova !== dadosSenha.confirma) return setErroSenha("A nova senha não confere.");
    if(dadosSenha.nova.length < 6) return setErroSenha("Mínimo 6 caracteres.");
    
    setCarregandoSenha(true);
    setErroSenha('');
    try {
      const identificador = usuarioLogado?.codigo || usuarioLogado?.id;
      const campoBusca = usuarioLogado?.codigo ? 'codigo' : 'id';

      const { data: userAtual, error: errUser } = await supabase.from('usuarios').select('senha').eq(campoBusca, identificador).single();
      if (errUser || !userAtual) throw new Error("Usuário não encontrado.");
      if (userAtual.senha !== dadosSenha.antiga) throw new Error("Senha antiga incorreta.");
      
      const { error } = await supabase.from('usuarios').update({ senha: dadosSenha.nova }).eq(campoBusca, identificador);
      if(error) throw error;
      
      alert("🔒 Senha alterada com sucesso!");
      setModalSenhaAberto(false);
      setDadosSenha({ antiga: '', nova: '', confirma: '' });
    } catch (err) {
      setErroSenha(err.message);
    } finally {
      setCarregandoSenha(false);
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
    if (perfil === 'faturista') return <span style={{ backgroundColor: '#8b5cf6', color: '#fff', padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '900', letterSpacing: '1px' }}>🧾 SETOR FISCAL</span>;
    return <span style={{ backgroundColor: isEscuro ? '#334155' : '#f1f5f9', color: isEscuro ? '#cbd5e1' : '#64748b', padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '900', letterSpacing: '1px' }}>👤 OPERADOR</span>;
  };

  const s = {
    btnNav: { background: 'none', border: 'none', color: config.menu.corTexto, textAlign: 'left', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold', padding: '12px 0', fontFamily: config.identidade.fontePrincipal }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: config.identidade.corFundoApp, overflow: 'hidden', fontFamily: config.identidade.fontePrincipal, transition: 'background-color 0.3s' }}>
      
      <button onClick={() => setMenuAberto(!menuAberto)} style={{ position: 'fixed', top: '20px', left: '20px', zIndex: 10000, backgroundColor: config.identidade.corDestaque, color: 'white', border: 'none', width: '50px', height: '50px', borderRadius: '12px', fontSize: '28px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
        {menuAberto ? '✕' : '⋮'}
      </button>

      {menuAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '280px', height: '100%', backgroundColor: config.identidade.corMenuLateral, color: 'white', padding: '80px 20px 30px 20px', zIndex: 9999, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', boxShadow: '10px 0 40px rgba(0,0,0,0.6)', transition: 'background-color 0.3s' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', paddingRight: '10px', paddingBottom: '80px' }}>
            <p style={{ fontSize: '10px', color: '#666', fontWeight: '900', letterSpacing: '1px' }}>NAVEGAÇÃO</p>
            
            {usuarioLogado.perfil !== 'faturista' && (
              <>
                <button onClick={() => navegarPara('inicio')} style={s.btnNav}>🏠 INÍCIO</button>
                <button onClick={() => navegarPara('cliente')} style={s.btnNav}>📱 APP COMPRAS</button>
              </>
            )}

            {usuarioLogado.perfil === 'cliente' && (
               <button onClick={() => navegarPara('fechamento_cliente')} style={s.btnNav}>📄 MEU FECHAMENTO</button>
            )}

            {usuarioLogado.perfil === 'faturista' && (
               <button onClick={() => navegarPara('notas_fiscais')} style={s.btnNav}>🧾 PAINEL NOTAS FISCAIS</button>
            )}
            
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
                <button onClick={() => navegarPara('listas')} style={s.btnNav}>📋 PAINEL DE CONFERÊNCIA</button>
                <button onClick={() => navegarPara('compras')} style={s.btnNav}>🛒 MESA DE COMPRAS</button>
                
                {/* 💡 BOTÃO DA CONFERÊNCIA DE MADRUGADA ADICIONADO AQUI */}
                <button onClick={() => navegarPara('madrugada')} style={{...s.btnNav, color: '#22c55e'}}>🔦 MADRUGADA (GALPÃO)</button>
                
                <button onClick={() => navegarPara('fechamento')} style={s.btnNav}>🧾 GESTÃO DE FECHAMENTOS</button>
                <button onClick={() => navegarPara('notas_fiscais')} style={s.btnNav}>🧾 PAINEL NOTAS FISCAIS</button> 
                <button onClick={() => navegarPara('fechamento_cliente')} style={s.btnNav}>📄 VISÃO CLIENTE (FECHAMENTO)</button>
              </>
            )}
          </div>
          
          <div style={{ paddingTop: '20px', borderTop: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isEscuro ? '#1e1e1e' : '#333', padding: '10px 15px', borderRadius: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>TEMA</span>
              <button onClick={() => setTema(isEscuro ? 'claro' : 'escuro')} style={{ background: isEscuro ? '#333' : '#f8fafc', color: isEscuro ? '#fff' : '#111', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {isEscuro ? '☀️ DIA' : '🌙 NOITE'}
              </button>
            </div>

            <button onClick={fazerLogout} style={{ width: '100%', backgroundColor: '#ef4444', color: 'white', padding: '15px', borderRadius: '12px', border: 'none', fontWeight: '900', cursor: 'pointer' }}>🚪 SAIR DO APP</button>
          </div>
        </div>
      )}

      <div style={{ width: '100%', height: '100%', paddingTop: '100px', paddingBottom: '150px', paddingLeft: '15px', paddingRight: '15px', overflowY: 'auto', boxSizing: 'border-box', zIndex: 1 }}>
        
        {telaAtiva === 'inicio' && (
          <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center', backgroundColor: config.identidade.corCard, padding: '40px 30px', borderRadius: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', transition: 'all 0.3s' }}>
            
            <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <button onClick={() => setModalConfiguracoesAberto(true)} style={{ background: isEscuro ? '#334155' : '#f1f5f9', border: 'none', width: '45px', height: '45px', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '22px' }}>⚙️</button>
              <button onClick={() => setModalNotificacoesAberto(true)} style={{ background: isEscuro ? '#334155' : '#f1f5f9', border: 'none', width: '45px', height: '45px', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                <span style={{ fontSize: '22px' }}>🔔</span>
                {historicoNotificacoes.some(n => !n.lida) && <span style={{ position: 'absolute', top: '0', right: '0', width: '12px', height: '12px', background: '#ef4444', borderRadius: '50%', border: '2px solid #fff' }}></span>}
              </button>
            </div>

            <p style={{ color: config.identidade.corTextoSecundario, fontSize: '12px', fontWeight: 'bold', margin: 0 }}>{saudacaoPorHorario()}</p>
            <h1 style={{ fontWeight: '900', color: config.identidade.corTexto, margin: 0, fontSize: '30px' }}><span style={{ color: config.identidade.corDestaque }}>{usuarioLogado.nome.toUpperCase()}</span></h1>
            <div style={{ marginTop: '5px' }}>{renderBadgePerfil(usuarioLogado.perfil)}</div>
            <hr style={{ width: '50px', border: `2px solid ${config.identidade.corDestaque}`, borderRadius: '10px', margin: '15px 0' }} />
            <p style={{ color: config.identidade.corTextoSecundario, fontWeight: 'bold', margin: 0, marginBottom: '20px' }}>Frazão Frutas & CIA</p>
            
            <button onClick={() => navegarPara('cliente')} style={{ backgroundColor: isEscuro ? '#f97316' : '#111', color: 'white', border: 'none', padding: '15px 30px', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize: '13px', width: '100%', maxWidth: '300px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', marginBottom: '10px' }}>📱 ABRIR APP DE PEDIDOS</button>

            {usuarioLogado.perfil === 'cliente' && (
               <button onClick={() => navegarPara('fechamento_cliente')} style={{ backgroundColor: isEscuro ? '#334155' : '#e2e8f0', color: config.identidade.corTexto, border: 'none', padding: '15px 30px', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize: '13px', width: '100%', maxWidth: '300px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>📄 VER MEU FECHAMENTO</button>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {!isStandalone && <button onClick={instalarApp} style={{ background: config.identidade.corDestaque, color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '12px', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>📥 INSTALAR APP NO CELULAR</button>}
            </div>
          </div>
        )}

        {telaAtiva === 'lojas' && <Lojas setTelaAtiva={setTelaAtiva} />}
        {telaAtiva === 'usuarios' && <Usuarios />}
        {telaAtiva === 'fornecedores' && <Fornecedores />}
        {telaAtiva === 'produtos' && <Produtos />}
        {telaAtiva === 'precificacao' && <Precificacao setTelaAtiva={setTelaAtiva} />}
        {telaAtiva === 'marketing' && <Marketing />}
        {telaAtiva === 'listas' && <Listas usuario={usuarioLogado} />}
        {telaAtiva === 'cliente' && usuarioLogado && <MenuCliente usuario={usuarioLogado} tema={tema} />}
        {telaAtiva === 'compras' && <PlanilhaCompras navegarPara={navegarPara} setTelaAtiva={setTelaAtiva} />}
        
        {/* 💡 RENDERIZAÇÃO DA TELA DE MADRUGADA */}
        {telaAtiva === 'madrugada' && <ConferenciaMadrugada />} 
        
        {telaAtiva === 'fechamento' && <FechamentoLojas isEscuro={isEscuro} />}
        {telaAtiva === 'fechamento_cliente' && <FechamentoCliente isEscuro={isEscuro} usuario={usuarioLogado} />}
        {telaAtiva === 'notas_fiscais' && <PainelNotasFiscais isEscuro={isEscuro} />}
      </div>

      {modalConfiguracoesAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 6500, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: config.identidade.corCard, width: '100%', maxWidth: '320px', borderRadius: '25px', padding: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: config.identidade.corTexto }}>Configurações</h3>
              <button onClick={() => setModalConfiguracoesAberto(false)} style={{ background: isEscuro ? '#334155' : '#f1f5f9', border: 'none', borderRadius: '50%', width: '35px', height: '35px', fontWeight: 'bold', cursor: 'pointer', color: config.identidade.corTexto }}>✕</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isEscuro ? '#0f172a' : '#f8fafc', border: `1px solid ${isEscuro ? '#334155' : '#e2e8f0'}`, borderRadius: '15px', padding: '15px' }}>
                <span style={{ fontWeight: 'bold', color: config.identidade.corTexto, fontSize: '14px' }}>Tema Visual</span>
                <button onClick={() => setTema(isEscuro ? 'claro' : 'escuro')} style={{ background: isEscuro ? '#1e293b' : '#fff', color: config.identidade.corTexto, border: `1px solid ${isEscuro ? '#475569' : '#ccc'}`, padding: '8px 12px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {isEscuro ? '☀️ CLARO' : '🌙 ESCURO'}
                </button>
              </div>

              <button onClick={() => { setModalConfiguracoesAberto(false); setModalSenhaAberto(true); }} style={{ width: '100%', padding: '18px', background: isEscuro ? '#0f172a' : '#f8fafc', border: `1px solid ${isEscuro ? '#334155' : '#e2e8f0'}`, borderRadius: '15px', fontWeight: 'bold', color: config.identidade.corTexto, cursor: 'pointer', textAlign: 'left', fontSize: '14px' }}>🔒 Alterar Minha Senha</button>
            </div>
          </div>
        </div>
      )}

      {modalSenhaAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 7000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: config.identidade.corCard, width: '100%', maxWidth: '350px', borderRadius: '25px', padding: '30px' }}>
            <h3 style={{ marginTop: 0, textAlign: 'center', color: config.identidade.corTexto, marginBottom: '20px' }}>Alterar Senha</h3>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: config.identidade.corTextoSecundario, display: 'block', marginBottom: '5px' }}>Senha Antiga</label>
              <input type={mostrarSenha ? "text" : "password"} value={dadosSenha.antiga} onChange={e => setDadosSenha({...dadosSenha, antiga: e.target.value})} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${isEscuro ? '#334155' : '#ddd'}`, background: isEscuro ? '#0f172a' : '#f8fafc', color: config.identidade.corTexto, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: config.identidade.corTextoSecundario, display: 'block', marginBottom: '5px' }}>Nova Senha</label>
              <input type={mostrarSenha ? "text" : "password"} value={dadosSenha.nova} onChange={e => setDadosSenha({...dadosSenha, nova: e.target.value})} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${isEscuro ? '#334155' : '#ddd'}`, background: isEscuro ? '#0f172a' : '#f8fafc', color: config.identidade.corTexto, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: config.identidade.corTextoSecundario, display: 'block', marginBottom: '5px' }}>Repetir Nova Senha</label>
              <input type={mostrarSenha ? "text" : "password"} value={dadosSenha.confirma} onChange={e => setDadosSenha({...dadosSenha, confirma: e.target.value})} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${isEscuro ? '#334155' : '#ddd'}`, background: isEscuro ? '#0f172a' : '#f8fafc', color: config.identidade.corTexto, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <input type="checkbox" checked={mostrarSenha} onChange={() => setMostrarSenha(!mostrarSenha)} style={{ width: '18px', height: '18px', accentColor: config.identidade.corDestaque }} />
              <label style={{ fontSize: '13px', color: config.identidade.corTexto, cursor: 'pointer' }} onClick={() => setMostrarSenha(!mostrarSenha)}>Mostrar senhas</label>
            </div>
            {erroSenha && <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold', textAlign: 'center', marginBottom: '15px', background: '#fef2f2', padding: '10px', borderRadius: '8px' }}>{erroSenha}</div>}
            <button onClick={salvarNovaSenha} disabled={carregandoSenha} style={{ width: '100%', padding: '18px', background: config.identidade.corDestaque, color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer' }}>{carregandoSenha ? 'SALVANDO...' : 'CONFIRMAR'}</button>
            <button onClick={() => { setModalSenhaAberto(false); setErroSenha(''); setDadosSenha({antiga:'', nova:'', confirma:''}); setMostrarSenha(false); }} style={{ width: '100%', marginTop: '10px', padding: '15px', background: 'transparent', color: config.identidade.corTextoSecundario, border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Cancelar</button>
          </div>
        </div>
      )}

      {modalNotificacoesAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 6000, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '85%', maxWidth: '380px', height: '100%', background: config.identidade.corCard, display: 'flex', flexDirection: 'column', animation: 'slideIn 0.3s ease-out' }}>
            <div style={{ padding: '25px 20px', borderBottom: `1px solid ${isEscuro ? '#334155' : '#eee'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontWeight: '900', color: config.identidade.corTexto }}>Notificações</h3>
              <button onClick={() => setModalNotificacoesAberto(false)} style={{ background: isEscuro ? '#334155' : '#f1f5f9', border: 'none', borderRadius: '50%', width: '35px', height: '35px', fontWeight: 'bold', cursor: 'pointer', color: config.identidade.corTexto }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
              {historicoNotificacoes.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: '50px', color: config.identidade.corTextoSecundario }}>Nenhuma notificação por enquanto.</div>
              ) : (
                historicoNotificacoes.map(n => (
                  <div key={n.id} style={{ padding: '15px', borderRadius: '15px', background: n.lida ? config.identidade.corFundoApp : (isEscuro ? '#451a03' : '#fff7ed'), marginBottom: '12px', border: n.lida ? `1px solid ${isEscuro ? '#334155' : '#eee'}` : `1px solid ${config.identidade.corDestaque}` }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: config.identidade.corTexto }}>{n.mensagem}</div>
                    <div style={{ fontSize: '10px', color: config.identidade.corTextoSecundario, marginTop: '5px' }}>{n.data}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </div>
  );
}

export default App;