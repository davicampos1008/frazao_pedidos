import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// --- CONFIGURAÇÃO DE PRAZOS (V.I.R.T.U.S) ---
const LIMITES_HORARIO = {
  0: "13:00", // Domingo
  1: "18:00", // Segunda
  2: "18:00", // Terça
  3: "14:00", // Quarta
  4: "18:00", // Quinta
  5: "18:00", // Sexta
  6: null,    // Sábado (Não tem envio)
  feriado: "13:00"
};

// Exemplo de feriados (Pode ser puxado do banco futuramente)
const FERIADOS = ["2026-04-03", "2026-04-21", "2026-05-01"]; 

export default function MenuCliente({ usuario, tema }) {
  // ... (mantenha seus states anteriores)
  const [tempoRestante, setTempoRestante] = useState(null);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  const [notificou30min, setNotificou30min] = useState(false);

  // --- LÓGICA DE MONITORAMENTO DE HORÁRIO ---
// Dentro do useEffect de monitoramento de horário no MenuCliente:

useEffect(() => {
  const verificarStatusEHorario = async () => {
    try {
      // 1. Busca as configurações globais marcadas por você na Precificação
      const { data: config } = await supabase
        .from('configuracoes')
        .select('is_feriado, nao_funciona')
        .eq('id', 1)
        .single();

      const agora = new Date();
      const diaSemana = agora.getDay();

      // TRAVA TOTAL: Se você marcou "Não Funcionamento"
      if (config?.nao_funciona) {
        setBloqueioAtivo(true);
        setTempoRestante("Loja fechada hoje");
        return;
      }

      // 2. Define o limite baseado no flag de feriado ou no dia da semana
      let limiteStr = config?.is_feriado ? LIMITES_HORARIO.feriado : LIMITES_HORARIO[diaSemana];

      if (limiteStr === null) {
        setBloqueioAtivo(true);
        setTempoRestante("Não há envios hoje");
        return;
      }

      // 3. Cálculo do tempo (mesma lógica anterior)
      const [horaH, minH] = limiteStr.split(':').map(Number);
      const dataLimite = new Date();
      dataLimite.setHours(horaH, minH, 0);

      const diffMs = dataLimite - agora;
      const diffMin = Math.floor(diffMs / 60000);

      if (diffMs <= 0) {
        setBloqueioAtivo(true);
        setTempoRestante("Prazo encerrado");
      } else {
        setBloqueioAtivo(false);
        setTempoRestante(`${Math.floor(diffMin / 60)}h ${diffMin % 60}min`);
        
        // Notificação de 30min
        if (diffMin <= 30 && !notificou30min) {
          mostrarNotificacao(`⚠️ Prazo encerrando! Envie sua lista até as ${limiteStr}.`, 'alerta');
          setNotificou30min(true);
        }
      }
    } catch (err) {
      console.error("Erro ao ler travas de horário:", err);
    }
  };

  verificarStatusEHorario();
  const timer = setInterval(verificarStatusEHorario, 30000);
  return () => clearInterval(timer);
}, [notificou30min]);
  // --- FUNÇÃO PARA COPIAR PARA WHATSAPP ---
  const copiarParaWhatsapp = () => {
    if (!listaEnviadaHoje) return;
    
    let texto = `*PEDIDO: ${nomeLojaLimpo}*\n`;
    texto += `*DATA:* ${new Date().toLocaleDateString('pt-BR')}\n`;
    texto += `----------------------------\n`;
    
    listaEnviadaHoje.forEach(item => {
      texto += `• *${item.quantidade}x* ${item.nome_produto} (${item.unidade_medida})`;
      if (item.qtd_bonificada > 0) texto += ` _+ ${item.qtd_bonificada} Bonif._`;
      texto += `\n`;
    });
    
    texto += `----------------------------\n`;
    texto += `_Enviado via V.I.R.T.U.S System_`;

    const link = `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
    window.open(link, '_blank');
  };

  // --- COMPONENTE DE ALERTA DE TEMPO ---
  const AlertaHorario = () => {
    if (!tempoRestante) return null;
    const isUrgente = tempoRestante.includes('0h') || bloqueioAtivo;

    return (
      <div style={{ 
        background: bloqueioAtivo ? '#ef4444' : (isUrgente ? '#f59e0b' : '#10b981'), 
        color: '#fff', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold' 
      }}>
        {bloqueioAtivo ? `🚫 ${tempoRestante}` : `⏳ TEMPO RESTANTE PARA ENVIO: ${tempoRestante}`}
      </div>
    );
  };
  {/* Adicione este bloco logo abaixo do <AlertaHorario /> */}
{isFeriadoMarcado && !bloqueioAtivo && (
  <div style={{ 
    background: '#fef3c7', color: '#92400e', 
    padding: '10px', fontSize: '12px', textAlign: 'center', 
    borderBottom: '1px solid #fde68a', fontWeight: 'bold' 
  }}>
    🚩 ATENÇÃO: Horário de Feriado (Limite até as {LIMITES_HORARIO.feriado})
  </div>
)}

{bloqueioAtivo && (
  <div style={{ padding: '40px 20px', textAlign: 'center' }}>
    <div style={{ fontSize: '60px' }}>😴</div>
    <h2 style={{ color: configDesign.cores.textoForte }}>Sistema Indisponível</h2>
    <p style={{ color: configDesign.cores.textoSuave }}>{tempoRestante}</p>
  </div>
)}

  // Renderização do Pedido Enviado (Modificada com botão WhatsApp)
  if (listaEnviadaHoje && !modoVisualizacao) {
    const aguardandoLiberacao = listaEnviadaHoje.some(item => item.solicitou_refazer === true);
    const edicaoLiberada = listaEnviadaHoje.some(item => item.liberado_edicao === true);

    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh' }}>
        <div style={{ background: edicaoLiberada ? configDesign.cores.sucesso : (aguardandoLiberacao ? configDesign.cores.promocao : configDesign.cores.textoForte), color: '#fff', padding: '40px 30px', borderRadius: '30px' }}>
          <div style={{fontSize: '50px'}}>{edicaoLiberada ? '🔓' : '✅'}</div>
          <h2>{edicaoLiberada ? 'EDIÇÃO LIBERADA' : 'PEDIDO RECEBIDO!'}</h2>
        </div>

        <div style={{ textAlign: 'left', marginTop: '20px', background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}` }}>
           {listaEnviadaHoje.map((item, i) => (
             <div key={i} style={{ padding: '8px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, color: configDesign.cores.textoForte }}>
               <b>{item.quantidade}x</b> {item.nome_produto}
             </div>
           ))}
        </div>

        <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* BOTÃO WHATSAPP ADICIONADO */}
          <button onClick={copiarParaWhatsapp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '18px', borderRadius: '15px', fontWeight: '900', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <span style={{fontSize: '20px'}}>💬</span> ENVIAR CÓPIA PARA WHATSAPP
          </button>

          <button onClick={() => carregarDados(false)} style={{ background: configDesign.cores.inputFundo, border: `1px solid ${configDesign.cores.borda}`, padding: '15px', borderRadius: '15px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>🔄 ATUALIZAR STATUS</button>
          
          {!bloqueioAtivo && (
             edicaoLiberada ? (
               <button onClick={importarParaCarrinho} style={{ background: configDesign.cores.sucesso, border: 'none', padding: '18px', borderRadius: '15px', color: '#fff', fontWeight: '900' }}>📥 EDITAR PEDIDO AGORA</button>
             ) : (
               <button onClick={aguardandoLiberacao ? null : pedirParaEditar} style={{ background: configDesign.cores.fundoCards, border: `2px solid ${configDesign.cores.textoForte}`, padding: '18px', borderRadius: '15px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>
                 {aguardandoLiberacao ? '⏳ AGUARDANDO ADMIN...' : '✏️ SOLICITAR EDIÇÃO'}
               </button>
             )
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral }}>
      <AlertaHorario />
      {/* Resto do seu MenuCliente (Header, Banners, Produtos, etc) */}
      
      {/* TRAVA NO BOTÃO DE ENVIAR (Modal Revisão) */}
      {modalRevisaoAberto && (
        <div style={{ /* estilo modal */ }}>
           {/* ... itens ... */}
           <div style={{ padding: '20px' }}>
             {bloqueioAtivo ? (
               <div style={{ background: '#fee2e2', color: '#ef4444', padding: '15px', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold', marginBottom: '10px' }}>
                 🕒 Horário limite excedido. Não é possível enviar listas agora.
               </div>
             ) : (
               <button onClick={confirmarEnvio} disabled={enviandoPedido} style={{ width: '100%', padding: '20px', background: configDesign.cores.sucesso, color: '#fff', borderRadius: '18px', fontWeight: '900' }}>
                 {enviandoPedido ? 'ENVIANDO...' : 'CONFIRMAR ENVIO'}
               </button>
             )}
           </div>
        </div>
      )}
    </div>
  );
}