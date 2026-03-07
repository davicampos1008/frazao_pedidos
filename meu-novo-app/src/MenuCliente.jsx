import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

// --- CONFIGURAÇÃO DE PRAZOS V.I.R.T.U.S ---
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

// ... (mantenha os imports e configDesign)

export default function MenuCliente({ usuario, tema }) {
  const [hoje, setHoje] = useState(new Date().toLocaleDateString('en-CA'));
  const [produtos, setProdutos] = useState([]);
  const [precosLiberados, setPrecosLiberados] = useState(false);
  const [bloqueioAtivo, setBloqueioAtivo] = useState(false);
  
  // --- SINCRONIZAÇÃO DE DATA E STATUS ---
  useEffect(() => {
    const sincronizarTudo = async () => {
      const { data: config } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      
      if (config) {
        // Se houver data de teste, o sistema assume ela como "HOJE"
        const dataEfetiva = config.data_teste || new Date().toLocaleDateString('en-CA');
        setHoje(dataEfetiva);
        setPrecosLiberados(config.precos_liberados);
        
        // Lógica de Bloqueio (Feriado / Funcionamento)
        const agora = new Date();
        const diaSemana = new Date(dataEfetiva + "T12:00:00").getDay(); // Ajuste para fuso
        
        if (config.nao_funciona) {
          setBloqueioAtivo(true);
          return;
        }

        const limiteStr = config.is_feriado ? LIMITES_HORARIO.feriado : LIMITES_HORARIO[diaSemana];
        if (!limiteStr) {
          setBloqueioAtivo(true);
        } else {
          // Verifica se já passou da hora no dia atual (se não for teste futuro)
          const [h, m] = limiteStr.split(':').map(Number);
          const dataLimite = new Date();
          dataLimite.setHours(h, m, 0);
          if (new Date() > dataLimite && dataEfetiva === new Date().toLocaleDateString('en-CA')) {
            setBloqueioAtivo(true);
          } else {
            setBloqueioAtivo(false);
          }
        }
      }
    };

    sincronizarTudo();
    const i = setInterval(sincronizarTudo, 10000);
    return () => clearInterval(i);
  }, []);

  // O carregarDados deve depender da variável 'hoje'
  const carregarDados = useCallback(async () => {
    const { data: pData } = await supabase.from('produtos').select('*').order('nome', { ascending: true });
    setProdutos(pData || []);

    const { data: pedData } = await supabase.from('pedidos')
      .select('*')
      .eq('data_pedido', hoje) // Usa a data (real ou teste)
      .eq('loja_id', codLoja);
    
    setListaEnviadaHoje(pedData?.length > 0 ? pedData : null);
  }, [hoje, codLoja]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // --- RENDERIZAÇÃO CONDICIONAL PARA NÃO DAR TELA BRANCA ---
  if (!precosLiberados && !listaEnviadaHoje) {
    return (
      <div style={{ padding: '50px', textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh' }}>
        <h2 style={{color: configDesign.cores.textoForte}}>Aguardando Preços...</h2>
        <p style={{color: configDesign.cores.textoSuave}}>A cotação de {new Date(hoje).toLocaleDateString('pt-BR')} ainda não foi liberada.</p>
      </div>
    );
  }

  // ... (Resto do código do MenuCliente)
}