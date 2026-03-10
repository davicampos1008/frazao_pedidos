import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

export default function MenuCliente({ usuario, tema }) {

  const isEscuro = tema === 'escuro';

  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif" },
    cores: {
      fundoGeral: isEscuro ? '#0f172a' : '#f8fafc',
      fundoCards: isEscuro ? '#1e293b' : '#ffffff',  
      primaria: '#f97316',      
      textoForte: isEscuro ? '#f8fafc' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      borda: isEscuro ? '#334155' : '#e2e8f0',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9',
      promocao: '#eab308',      
      novidade: '#a855f7',      
      sucesso: '#22c55e',       
      alerta: '#ef4444'         
    },
    cards: { raioBorda: '16px', sombra: isEscuro ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.03)', alturaImgDestaque: '220px', alturaImgPequena: '85px' },
    animacoes: { transicaoSuave: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }
  };

  const hoje = new Date().toLocaleDateString('en-CA'); 
  const horaAtual = new Date().getHours();
  const saudacaoStr = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  
  // 💡 GARANTE QUE AS VARIÁVEIS NÃO DEEM TELA BRANCA
  const primeiroNome = (usuario?.nome || 'Cliente').split(' ')[0];
  const nomeLojaLimpo = (usuario?.loja || 'Matriz').replace(/^\d+\s*-\s*/, '').trim();
  const codLoja = usuario?.codigo_loja || parseInt(String(usuario?.nome || "").match(/\d+/)?.[0]);

  const categoriasDinamicas = ['DESTAQUES', 'TODOS', '🍎 Frutas', '🥬 Verduras & Fungos', '🥕 Legumes', '🥔 Raízes, Tubérculos & Grãos', '🍱 Bandejados', '🛒 Avulsos', '🌿 Folhagens', '📦 Caixaria', '🧄 BRADISBA', '🥥 POTY COCOS', '🧅 MEGA', '⭐ LISTA PADRÃO'];

  const [produtos, setProdutos] = useState([]);
  const [categoriaAtiva, setCategoriaAtiva] = useState('DESTAQUES');
  const [precosLiberados, setPrecosLiberados] = useState(false); 
  const [buscaMenu, setBuscaMenu] = useState('');
  
  const [carrinho, setCarrinho] = useState(() => {
    try {
      const salvo = localStorage.getItem('carrinho_virtus');
      const parseado = JSON.parse(salvo);
      return Array.isArray(parseado) ? parseado.filter(item => item && item.id && item.nome) : [];
    } catch (e) { return []; }
  });

  const [produtoExpandido, setProdutoExpandido] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [qtdBonificada, setQtdBonificada] = useState(0); 
  const [temBonificacao, setTemBonificacao] = useState(false);

  const [modalCarrinhoAberto, setModalCarrinhoAberto] = useState(false);
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false);
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  
  const [listaEnviadaHoje, setListaEnviadaHoje] = useState(null);
  const [modoVisualizacao, setModoVisualizacao] = useState(false); 
  const [itemEditandoId, setItemEditandoId] = useState(null);

  const [navState, setNavState] = useState({ show: true, shrink: false });
  const ultimoScroll = useRef(0);
  
  const [banners, setBanners] = useState({ topo: '', logo: '', tematico: '' });
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  
  const [notificacoes, setNotificacoes] = useState([]);
  const [historicoNotificacoes, setHistoricoNotificacoes] = useState(() => {
    try {
      const salvo = localStorage.getItem('historico_notif_virtus');
      return salvo ? JSON.parse(salvo) : [];
    } catch (e) { return []; }
  });
  const [modalNotificacoesAberto, setModalNotificacoesAberto] = useState(false);
  const [modalConfiguracoesAberto, setModalConfiguracoesAberto] = useState(false);

  const [botaoCopiado, setBotaoCopiado] = useState(false);
  const [itemParaAjuste, setItemParaAjuste] = useState(null);
  const [novaQtdItem, setNovaQtdItem] = useState(1);
  const [novaBonifItem, setNovaBonifItem] = useState(0);
  const [temNovaBonif, setTemNovaBonif] = useState(false);

  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [dadosSenha, setDadosSenha] = useState({ antiga: '', nova: '', confirma: '' });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');
  const [carregandoSenha, setCarregandoSenha] = useState(false);

  const produtosCarregadosRef = useRef(false);
  const dataUltimoCarregamento = useRef(0);
  const enviandoRef = useRef(false);
  const itensPendentesRef = useRef([]);

  const [horarioLimite, setHorarioLimite] = useState(null);
  const [minutosRestantes, setMinutosRestantes] = useState(999);
  const [lojaFechada, setLojaFechada] = useState(false);
  const [appTravadoPorHorario, setAppTravadoPorHorario] = useState(false);
  const [avisoDiario, setAvisoDiario] = useState('');

  // 💡 ESTADO EXCLUSIVO PARA O TEMPO EXTRA DE 5 MINUTOS (Ajustado com nome único para não bugar)
  const [tempoExtra, setTempoExtra] = useState(() => {
    const salvoFinal = localStorage.getItem(`timer_extra_virtus_${hoje}`);
    if (salvoFinal) {
      const resto = Math.floor((parseInt(salvoFinal) - Date.now()) / 1000);
      return resto > 0 ? resto : null;
    }
    return null;
  });

  const [alerta30MinDisparado, setAlerta30MinDisparado] = useState(false);
  const [alerta5MinDisparado, setAlerta5MinDisparado] = useState(false);

  const syncBloqueioRef = useRef(false);
  const carrinhoRef = useRef(carrinho);
  useEffect(() => { carrinhoRef.current = carrinho; }, [carrinho]);
  const listaEnviadaRef = useRef(listaEnviadaHoje);
  useEffect(() => { listaEnviadaRef.current = listaEnviadaHoje; }, [listaEnviadaHoje]);

  // 💡 LÓGICA DO ENVIO FORÇADO QUANDO O CRONÔMETRO ZERA
  const confirmarEnvioForcado = useCallback(async () => {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviandoPedido(true);
    try {
        const dadosParaEnviar = carrinhoRef.current.map(item => ({
          loja_id: codLoja, nome_usuario: usuario?.nome || "Operador", nome_produto: item.nome, 
          quantidade: item.quantidade || 1, qtd_bonificada: item.qtd_bonificada || 0, unidade_medida: item.unidade_medida || 'UN', 
          data_pedido: hoje, solicitou_refazer: false, solicitou_edicao_item: false, texto_edicao_item: null, liberado_edicao: false, status_compra: 'pendente' 
        }));
        await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
        if (dadosParaEnviar.length > 0) {
           await supabase.from('pedidos').insert(dadosParaEnviar);
        }
        
        await supabase.from('carrinhos_compartilhados').delete().eq('loja_id', codLoja);
        
        // 💡 Limpa o cronômetro local para ele não ligar de novo ao abrir o app
        localStorage.removeItem(`timer_extra_virtus_${hoje}`);
        setTempoExtra(null);

        setListaEnviadaHoje(dadosParaEnviar); setCarrinho([]); 
        localStorage.removeItem('carrinho_virtus'); localStorage.removeItem('itens_pendentes_virtus');
        setModalRevisaoAberto(false); setModalCarrinhoAberto(false); setModoVisualizacao(false); window.scrollTo(0,0);
        alert("⏰ TEMPO ESGOTADO! Seu pedido foi salvo e enviado automaticamente para a Central.");
    } catch(e) {} finally { setEnviandoPedido(false); enviandoRef.current = false; }
  }, [codLoja, hoje, usuario]);

  // 💡 MOTOR DO CRONÔMETRO (Trava para parar quando a lista for enviada)
  useEffect(() => {
    const contador = setInterval(() => {
      const salvoFinal = localStorage.getItem(`timer_extra_virtus_${hoje}`);
      if (salvoFinal) {
        const resto = Math.floor((parseInt(salvoFinal) - Date.now()) / 1000);
        if (resto > 0) {
           setTempoExtra(resto);
        } else {
           // Chegou a Zero: Envia, remove o timer e para a contagem
           setTempoExtra(null);
           localStorage.removeItem(`timer_extra_virtus_${hoje}`);
           clearInterval(contador);
           
           if (carrinhoRef.current.length > 0 && !enviandoRef.current) {
               confirmarEnvioForcado();
           }
        }
      } else {
        setTempoExtra(null);
      }
    }, 1000);

    return () => clearInterval(contador);
  }, [hoje, confirmarEnvioForcado]);

  // 💡 SINCRONIZAÇÃO DO CARRINHO (3 EM 3 SEGUNDOS)
  useEffect(() => {
    if (!codLoja || modalRevisaoAberto) return;
    const syncCarrinho = async () => {
      if (syncBloqueioRef.current) return;
      const { data } = await supabase.from('carrinhos_compartilhados').select('itens').eq('loja_id', codLoja).maybeSingle();
      if (data?.itens && JSON.stringify(data.itens) !== JSON.stringify(carrinho)) {
        setCarrinho(data.itens);
      }
    };
    const interval = setInterval(syncCarrinho, 3000);
    return () => clearInterval(interval);
  }, [codLoja, carrinho, modalRevisaoAberto]);

  // 💡 SALVA CARRINHO NO BANCO QUANDO ALTERA
  useEffect(() => {
    if (!codLoja) return;
    const salvarNoBanco = async () => {
      syncBloqueioRef.current = true;
      await supabase.from('carrinhos_compartilhados').upsert({ loja_id: codLoja, itens: carrinho, atualizado_por: usuario?.nome });
      syncBloqueioRef.current = false;
    };
    salvarNoBanco();
    localStorage.setItem('carrinho_virtus', JSON.stringify(carrinho));
  }, [carrinho, codLoja, usuario]);

  // 💡 STATUS ONLINE NO BANCO (PRESENCE)
  useEffect(() => {
    if (!codLoja) return;
    const presenceChannel = supabase.channel(`online-stores`, { config: { presence: { key: String(codLoja) } } });
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await presenceChannel.track({ loja_id: Number(codLoja), nome: usuario?.nome || "Operador", online_at: new Date().toISOString() });
    });

    const canalRespostas = supabase.channel(`respostas_loja_${codLoja}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `loja_id=eq.${codLoja}` }, () => {
         carregarDados(true);
      }).subscribe();

    return () => {
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(canalRespostas);
    };
  }, [codLoja, usuario]);

  useEffect(() => {
    document.body.style.backgroundColor = configDesign.cores.fundoGeral;
    document.documentElement.style.backgroundColor = configDesign.cores.fundoGeral;
  }, [configDesign.cores.fundoGeral]);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > ultimoScroll.current && currentY > 150) setNavState({ show: false, shrink: true }); 
      else if (currentY < ultimoScroll.current) setNavState({ show: true, shrink: currentY > 60 }); 
      ultimoScroll.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
     if (listaEnviadaHoje) {
         itensPendentesRef.current = listaEnviadaHoje.filter(i => i.solicitou_edicao_item === true).map(i => i.id);
     }
  }, [listaEnviadaHoje]);

  const mostrarNotificacao = useCallback((mensagem, tipo = 'info', tituloPush = 'Frazão Frutas & CIA') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setHistoricoNotificacoes(prev => [{ id, mensagem, tipo, data: new Date().toLocaleTimeString(), lida: false }, ...prev].slice(0, 30));
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 6000);
    
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(tituloPush, { body: mensagem, icon: banners.logo }); } catch (e) {}
    }
  }, [banners.logo]);

  // 💡 RECEBE NOTIFICAÇÃO SE O ITEM (CORREÇÃO ÚNICA) FOI ACEITO/RECUSADO
  useEffect(() => {
      if (!listaEnviadaHoje) return;

      const pendentesSalvos = JSON.parse(localStorage.getItem('itens_pendentes_virtus') || '[]');
      if (pendentesSalvos.length === 0) return;

      let mudouAlgo = false;
      
      listaEnviadaHoje.forEach(item => {
          if (pendentesSalvos.includes(item.id) && item.solicitou_edicao_item === false) {
              try {
                  const dados = JSON.parse(item.texto_edicao_item);
                  if (dados && dados.status === 'aprovado') {
                      mostrarNotificacao(`✅ Ajuste Aprovado: ${item.nome_produto} atualizado para ${dados.qtd}!`, 'sucesso');
                      alert(`✅ PEDIDO APROVADO\n\nA Central atualizou a quantidade de ${item.nome_produto} para ${dados.qtd}!`);
                  } else if (dados && dados.status === 'recusado') {
                      mostrarNotificacao(`❌ Ajuste Recusado: ${item.nome_produto} mantido.`, 'alerta');
                      alert(`❌ PEDIDO RECUSADO\n\nA Central não aprovou a alteração de ${item.nome_produto}.`);
                  }
              } catch(e) {}
              
              const idx = pendentesSalvos.indexOf(item.id);
              if (idx > -1) pendentesSalvos.splice(idx, 1);
              mudouAlgo = true;
          }
      });

      if (mudouAlgo) {
          localStorage.setItem('itens_pendentes_virtus', JSON.stringify(pendentesSalvos));
      }
  }, [listaEnviadaHoje, mostrarNotificacao]);

  useEffect(() => { localStorage.setItem('historico_notif_virtus', JSON.stringify(historicoNotificacoes)); }, [historicoNotificacoes]);

  const abrirCentralNotificacoes = () => {
     setModalNotificacoesAberto(true);
     setHistoricoNotificacoes(prev => prev.map(n => ({...n, lida: true})));
  };

  const removerAcentos = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tratarPreco = (p) => parseFloat(String(p || '0').replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => { const num = Number(v); return (isNaN(num) ? 0 : num).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  
  const tratarInfosDeVenda = (produto) => {
    if (!produto) return { precoBase: 0, textoPreco: '' };
    const precoKg = tratarPreco(produto.preco);
    const matchPeso = String(produto.peso_caixa || '').match(/^([A-Z]+)\s+(.+)$/);
    const siglaMedidaVisual = matchPeso ? matchPeso[1] : 'CX';
    const pesoCx = parseFloat(String(produto.peso_caixa || '').replace(/[^\d.]/g, ''));

    if (produto.unidade_medida === 'KG' && pesoCx > 0) {
      const precoCaixa = precoKg * pesoCx;
      return { isCaixa: true, precoBase: precoCaixa, textoPreco: `${formatarMoeda(precoCaixa)} / ${siglaMedidaVisual}`, textoSecundario: `(${siglaMedidaVisual} c/ ${pesoCx}kg - ${formatarMoeda(precoKg)} o Kg)`, unidadeFinal: siglaMedidaVisual };
    }
    return { isCaixa: false, precoBase: precoKg, textoPreco: `${produto.preco} / ${produto.unidade_medida}`, textoSecundario: '', unidadeFinal: produto.unidade_medida };
  };

  const formatarQtdUnidade = (qtd, und) => {
    const u = String(und || 'UN').toUpperCase();
    const q = Number(qtd);
    const qFinal = isNaN(q) ? 1 : q;
    if (qFinal <= 1 || ['UN', 'KG'].includes(u)) return `${qFinal} ${u}`;
    return `${qFinal} ${u}S`;
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (enviandoRef.current) return;
    const agora = Date.now();
    if (agora - dataUltimoCarregamento.current < 2000) return;
    if (silencioso && agora - dataUltimoCarregamento.current < 8000) return;
    dataUltimoCarregamento.current = agora;

    try {
      const { data: configData } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      
      if (configData) {
         setPrecosLiberados(configData.precos_liberados);

         const dataAtual = new Date();
         let diaDaSemana = dataAtual.getDay(); 
         
         if (configData.dia_semana_teste !== null && configData.dia_semana_teste >= 0 && configData.dia_semana_teste <= 6) {
             diaDaSemana = configData.dia_semana_teste;
         }

         let horaLimiteDefinida = 18; 
         let textoAviso = "Horário de Fechamento: 18h";

         if (configData.nao_funciona === true || diaDaSemana === 6) {
             setLojaFechada(true);
             setHorarioLimite(null);
             setAvisoDiario("LOJA FECHADA HOJE");
         } else {
             setLojaFechada(false);
             if (configData.is_feriado === true) {
                 horaLimiteDefinida = 13; textoAviso = "⚠️ Feriado: Fechamento às 13h";
             } else if (diaDaSemana === 0) {
                 horaLimiteDefinida = 13; textoAviso = "Domingo: Fechamento às 13h";
             } else if (diaDaSemana === 3) {
                 horaLimiteDefinida = 14; textoAviso = "Quarta-feira: Fechamento às 14h";
             }
             setHorarioLimite(horaLimiteDefinida);
             setAvisoDiario(textoAviso);
         }
      }

      if (!produtosCarregadosRef.current) {
        const { data: dbBanners } = await supabase.from('banners').select('*');
        if (dbBanners) {
          const bMap = {}; dbBanners.forEach(b => bMap[b.posicao] = b.imagem_url);
          setBanners({ topo: bMap.topo || '', logo: bMap.logo || '', tematico: bMap.tematico || '' });
        }
        
        const { data: pData } = await supabase.from('produtos').select('*').eq('status', true).order('nome', { ascending: true });
        if (pData) { setProdutos(pData); produtosCarregadosRef.current = true; }
      }

      if (codLoja) {
        const { data: pedidoExistente } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).eq('loja_id', codLoja);
        setListaEnviadaHoje(pedidoExistente?.length > 0 ? pedidoExistente : null);
      }
    } catch (e) { console.error("Erro VIRTUS:", e); }
  }, [codLoja, hoje]); 

  useEffect(() => { carregarDados(); }, [carregarDados]);
  
  // CHECAGEM DE HORÁRIO PRINCIPAL
  useEffect(() => {
     if (lojaFechada || horarioLimite === null) return;

     const calcularTempo = () => {
         const agora = new Date();
         const horaFim = new Date();
         horaFim.setHours(horarioLimite, 0, 0, 0);

         const diffMs = horaFim - agora;
         const diffMinutos = Math.ceil(diffMs / 60000);

         setMinutosRestantes(diffMinutos);

         if (diffMinutos <= 0) {
             setAppTravadoPorHorario(true);
         } else {
             setAppTravadoPorHorario(false);
             if (diffMinutos <= 30 && diffMinutos > 29 && !alerta30MinDisparado) {
                 alert("⚠️ ATENÇÃO: Faltam 30 minutos para o encerramento dos pedidos de hoje!");
                 setAlerta30MinDisparado(true);
             }
             if (diffMinutos <= 5 && diffMinutos > 4 && !alerta5MinDisparado) {
                 alert("🚨 URGENTE: Faltam apenas 5 minutos! Envie sua lista agora ou ela será bloqueada.");
                 setAlerta5MinDisparado(true);
             }
         }
     };

     calcularTempo();
     const timer = setInterval(calcularTempo, 30000); 
     return () => clearInterval(timer);
  }, [horarioLimite, lojaFechada]);

  const carrinhoSeguro = carrinho.filter(i => i && typeof i === 'object' && i.id && i.nome);
  const valorTotalCarrinho = carrinhoSeguro.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
  const edicaoLiberadaBD = listaEnviadaHoje?.some(item => item.liberado_edicao === true);
  
  // 💡 SÓ TRAVA O APP SE O CRONÔMETRO TIVER ZERADO
  const isAppTravado = !precosLiberados || lojaFechada || 
                       (listaEnviadaHoje && !edicaoLiberadaBD) || 
                       (appTravadoPorHorario && !(tempoExtra > 0));

  const abrirProduto = (p) => {
    setProdutoExpandido(p);
    const itemExistente = carrinhoSeguro.find(i => i.id === p.id);
    setQuantidade(itemExistente?.quantidade || 1);
    setQtdBonificada(itemExistente?.qtd_bonificada || 0);
    setTemBonificacao(!!itemExistente?.qtd_bonificada && itemExistente.qtd_bonificada > 0);
  };
  
  const tratarInputQuantidade = (valorDigitado) => { const val = parseInt(valorDigitado, 10); setQuantidade(isNaN(val) || val < 1 ? '' : val); };
  const tratarInputBonificacao = (valorDigitado) => { const val = parseInt(valorDigitado, 10); setQtdBonificada(isNaN(val) || val < 0 ? 0 : val); };

  const salvarNoCarrinho = () => {
    if (isAppTravado) return alert("Ações bloqueadas neste momento.");
    const qtdFinal = parseInt(quantidade, 10) || 1;
    const bonifFinal = temBonificacao ? (parseInt(qtdBonificada, 10) || 0) : 0;
    const bonificacaoSegura = Math.min(qtdFinal, bonifFinal);
    const qtdCobrada = Math.max(0, qtdFinal - bonificacaoSegura);
    const infosVenda = tratarInfosDeVenda(produtoExpandido);
    
    if (produtoExpandido.status_cotacao === 'falta') {
      if (!window.confirm(`⚠️ AVISO: O item "${produtoExpandido.nome}" está marcado como EM FALTA. Deseja adicionar ao pedido mesmo assim?`)) return;
    } else if (produtoExpandido.status_cotacao === 'sem_preco' || infosVenda.precoBase === 0) {
      if (!window.confirm(`⚠️ AVISO: O item "${produtoExpandido.nome}" está SEM PREÇO definido hoje. O valor final será atualizado posteriormente. Deseja confirmar?`)) return;
    }
    
    const valorTotalItem = infosVenda.precoBase * qtdCobrada;
    const itemEx = carrinhoSeguro.find(i => i.id === produtoExpandido.id);
    const novoItemFormatado = { ...produtoExpandido, quantidade: qtdFinal, qtd_bonificada: bonificacaoSegura, valorUnit: infosVenda.precoBase, total: valorTotalItem, unidade_medida: infosVenda.unidadeFinal };

    if (itemEx) setCarrinho(carrinhoSeguro.map(i => i.id === produtoExpandido.id ? novoItemFormatado : i));
    else setCarrinho([...carrinhoSeguro, novoItemFormatado]);
    setProdutoExpandido(null);
  };

  const alterarQtdCart = (id, delta) => {
    if (isAppTravado) return;
    setCarrinho(prev => prev.map(item => {
      if (item.id === id) {
        const novaQtd = Math.max(1, (Number(item.quantidade) || 0) + delta);
        const bonif = Number(item.qtd_bonificada) || 0;
        const cobrada = Math.max(0, novaQtd - bonif);
        return { ...item, quantidade: novaQtd, total: cobrada * (Number(item.valorUnit) || 0) };
      }
      return item;
    }));
  };

  const alterarQtdCartInput = (id, valor) => {
    if (isAppTravado) return;
    const novaQtd = parseInt(valor, 10) || 1;
    setCarrinho(prev => prev.map(item => {
        if (item.id === id) {
            const bonif = Number(item.qtd_bonificada) || 0;
            const cobrada = Math.max(0, novaQtd - bonif);
            return { ...item, quantidade: novaQtd, total: cobrada * (Number(item.valorUnit) || 0) };
        }
        return item;
    }));
  };

  const zerarCarrinho = () => { if (window.confirm("⚠️ Esvaziar carrinho?")) { setCarrinho([]); setModalCarrinhoAberto(false); } };

  const abrirRevisao = () => {
    if(carrinhoSeguro.length === 0) return;
    const itensPadrao = produtos.filter(p => p.lista_padrao === true && p.status_cotacao !== 'falta' && p.status_cotacao !== 'sem_preco');
    const itensFaltando = itensPadrao.filter(pPadrao => !carrinhoSeguro.some(c => c.id === pPadrao.id));

    if (itensFaltando.length > 0) {
      const listaNomes = itensFaltando.map(i => `- ${i.nome}`).join('\n');
      if (!window.confirm(`⚠️ AVISO DE LISTA PADRÃO\n\nVocê esqueceu de adicionar os seguintes itens da sua lista padrão:\n\n${listaNomes}\n\nDeseja revisar o pedido antes de enviar?`)) {
        setCategoriaAtiva('⭐ LISTA PADRÃO'); setModalCarrinhoAberto(false); return;
      }
    }
    setModalRevisaoAberto(true);
  };

  const confirmarEnvio = async () => {
    if (!codLoja) return alert("🚨 ERRO: Sem Loja vinculada.");
    setEnviandoPedido(true); enviandoRef.current = true; 
    try {
      const dadosParaEnviar = carrinhoSeguro.map(item => ({
        loja_id: codLoja, nome_usuario: usuario?.nome || "Operador", nome_produto: item.nome, 
        quantidade: item.quantidade || 1, qtd_bonificada: item.qtd_bonificada || 0, unidade_medida: item.unidade_medida || 'UN', 
        data_pedido: hoje, solicitou_refazer: false, solicitou_edicao_item: false, texto_edicao_item: null, liberado_edicao: false, status_compra: 'pendente' 
      }));

      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      const { error } = await supabase.from('pedidos').insert(dadosParaEnviar);
      if (error) throw error;

      await supabase.from('carrinhos_compartilhados').delete().eq('loja_id', codLoja);
      
      // 💡 REMOVE A TRAVA DO CRONÔMETRO QUANDO ENVIA COM SUCESSO
      localStorage.removeItem(`timer_extra_virtus_${hoje}`);
      setTempoExtra(null);

      setListaEnviadaHoje(dadosParaEnviar); setCarrinho([]); 
      localStorage.removeItem('carrinho_virtus'); localStorage.removeItem('itens_pendentes_virtus'); 
      setModalRevisaoAberto(false); setModalCarrinhoAberto(false); setModoVisualizacao(false); window.scrollTo(0,0); 
      mostrarNotificacao("🚀 LISTA ENVIADA COM SUCESSO!", 'sucesso');
      enviandoRef.current = false;
    } catch (err) { alert("Erro ao gravar: " + err.message); enviandoRef.current = false; } finally { setEnviandoPedido(false); }
  };

  const pedirParaEditar = async () => {
    const msg = appTravadoPorHorario ? "⏰ O horário de envios já encerrou. Deseja pedir autorização à Central para enviar uma lista atrasada?" : "Pedir ao administrador para liberar a edição da lista toda?";
    if(!window.confirm(msg)) return;
    try {
        if (appTravadoPorHorario) {
            await supabase.from('pedidos').upsert([{ loja_id: codLoja, nome_usuario: usuario?.nome || "Operador", nome_produto: "⏰ PEDIDO ATRASADO", quantidade: 1, unidade_medida: 'UN', data_pedido: hoje, solicitou_refazer: true, liberado_edicao: false }]);
            mostrarNotificacao("✅ Pedido de exceção enviado! Aguarde a Central liberar seu carrinho.", 'sucesso');
            carregarDados(true);
        } else {
            await supabase.from('pedidos').update({ solicitou_refazer: true }).eq('data_pedido', hoje).eq('loja_id', codLoja);
            setListaEnviadaHoje(prev => prev.map(item => ({...item, solicitou_refazer: true})));
            mostrarNotificacao("✅ Solicitação enviada! Aguarde.", 'sucesso');
        }
    } catch (err) { alert("Erro ao solicitar: " + err.message); }
  };

  const copiarListaEnviada = () => {
    const cabecalho = `*MINHA LISTA - ${nomeLojaLimpo}*\nData: ${new Date().toLocaleDateString('pt-BR')}`;
    const corpo = listaEnviadaHoje.filter(i => i.nome_produto !== "⏰ PEDIDO ATRASADO").map(i => {
      let l = `- ${i.quantidade} ${i.unidade_medida} : ${i.nome_produto}`;
      if(i.qtd_bonificada > 0) l += ` (+${i.qtd_bonificada} bonif)`;
      return l;
    }).join('\n');
    navigator.clipboard.writeText(`${cabecalho}\n\n${corpo}`);
    setBotaoCopiado(true); setTimeout(() => setBotaoCopiado(false), 2000);
  };

  const abrirModalAjuste = (item) => {
      setItemParaAjuste(item); setNovaQtdItem(item.quantidade);
      setNovaBonifItem(item.qtd_bonificada || 0); setTemNovaBonif(item.qtd_bonificada > 0);
  };

  const enviarAjusteItem = async () => {
     const bonifSegura = temNovaBonif ? novaBonifItem : 0;
     const payloadJson = JSON.stringify({ qtd: novaQtdItem, bonif: bonifSegura, status: 'pendente', hora_pedido: new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) });

     try {
         await supabase.from('pedidos').update({ solicitou_edicao_item: true, texto_edicao_item: payloadJson }).eq('id', itemParaAjuste.id);
         
         const pendentesSalvos = JSON.parse(localStorage.getItem('itens_pendentes_virtus') || '[]');
         if (!pendentesSalvos.includes(itemParaAjuste.id)) {
             pendentesSalvos.push(itemParaAjuste.id);
             localStorage.setItem('itens_pendentes_virtus', JSON.stringify(pendentesSalvos));
         }

         setListaEnviadaHoje(prev => prev.map(i => i.id === itemParaAjuste.id ? {...i, solicitou_edicao_item: true, texto_edicao_item: payloadJson} : i));
         setItemParaAjuste(null); mostrarNotificacao("✅ Aviso enviado para a central!", 'sucesso');
     } catch (err) { alert("Erro: " + err.message); }
  };

  // 💡 QUANDO A CENTRAL LIBERAR, GERA O CARIMBO DO TEMPO FUTURO
  const importarParaCarrinho = async () => {
    if(!window.confirm("Isso vai voltar os itens para o carrinho para você ajustar. Continuar?")) return;
    try {
      await supabase.from('pedidos').delete().eq('data_pedido', hoje).eq('loja_id', codLoja);
      const itensRestaurados = listaEnviadaHoje.filter(i => i.nome_produto !== "⏰ PEDIDO ATRASADO").map(dbItem => {
        const prodOriginal = produtos.find(p => p.nome === dbItem.nome_produto);
        if (prodOriginal) {
          const infosVenda = tratarInfosDeVenda(prodOriginal);
          const bonif = Number(dbItem.qtd_bonificada) || 0;
          const qtdCobr = Math.max(0, dbItem.quantidade - bonif);
          return { ...prodOriginal, quantidade: dbItem.quantidade, qtd_bonificada: bonif, valorUnit: infosVenda.precoBase, total: infosVenda.precoBase * qtdCobr, unidade_medida: infosVenda.unidadeFinal };
        }
        return { id: Math.random(), nome: dbItem.nome_produto, quantidade: dbItem.quantidade, qtd_bonificada: dbItem.qtd_bonificada || 0, valorUnit: 0, total: 0, unidade_medida: dbItem.unidade_medida };
      });
      
      // SALVA O CARIMBO DO TEMPO
      if (appTravadoPorHorario) {
          const fimExtra = Date.now() + (5 * 60 * 1000);
          localStorage.setItem(`timer_extra_virtus_${hoje}`, fimExtra.toString());
          setTempoExtra(300);
      }

      setCarrinho(itensRestaurados); setListaEnviadaHoje(null); setModoVisualizacao(false);
      localStorage.removeItem('itens_pendentes_virtus'); 
    } catch (err) { alert("Erro ao importar: " + err.message); }
  };

  const instalarApp = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    }
  };

  const salvarNovaSenha = async () => {
    if(!dadosSenha.antiga || !dadosSenha.nova || !dadosSenha.confirma) return setErroSenha("Preencha todos os campos.");
    if(dadosSenha.nova !== dadosSenha.confirma) return setErroSenha("A nova senha não confere.");
    if(dadosSenha.nova.length < 6) return setErroSenha("A nova senha deve ter no mínimo 6 caracteres.");
    
    setCarregandoSenha(true); setErroSenha('');
    try {
      const { data: u, error: errU } = await supabase.from('usuarios').select('*').eq('nome', usuario.nome).single();
      if(errU || !u) throw new Error("Usuário não encontrado.");
      if(u.senha !== dadosSenha.antiga) throw new Error("A senha antiga está incorreta.");
      
      const { error } = await supabase.from('usuarios').update({ senha: dadosSenha.nova }).eq('id', u.id);
      if(error) throw error;
      
      mostrarNotificacao("🔒 Senha alterada com sucesso!", 'sucesso');
      setModalSenhaAberto(false);
      setDadosSenha({ antiga: '', nova: '', confirma: '' });
    } catch (err) { setErroSenha(err.message); } finally { setCarregandoSenha(false); }
  };

  let corBarraTempo = '#22c55e'; 
  if (minutosRestantes <= 30) corBarraTempo = '#f59e0b'; 
  if (minutosRestantes <= 5 || appTravadoPorHorario || lojaFechada) corBarraTempo = '#ef4444'; 

  const formatarCronometro = (segs) => {
      if (segs === null || isNaN(segs)) return "00:00";
      const m = Math.floor(segs / 60).toString().padStart(2, '0');
      const s = (segs % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
  };

  // =====================================================================
  // TELA 1: TELA DE PEDIDO JÁ ENVIADO
  // =====================================================================
  if (listaEnviadaHoje && !modoVisualizacao) {
    const aguardandoLiberacao = listaEnviadaHoje.some(item => item.solicitou_refazer === true);
    const edicaoLiberada = listaEnviadaHoje.some(item => item.liberado_edicao === true);
    const pediuAtraso = listaEnviadaHoje.some(item => item.nome_produto === "⏰ PEDIDO ATRASADO");

    return (
      <div style={{ padding: '20px', fontFamily: configDesign.geral.fontePadrao, textAlign: 'center', backgroundColor: configDesign.cores.fundoGeral, minHeight: '100vh', paddingBottom: '50px' }}>
        
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notificacoes.map(n => (
             <div key={n.id} style={{ background: n.tipo === 'sucesso' ? configDesign.cores.sucesso : n.tipo === 'alerta' ? configDesign.cores.alerta : '#3b82f6', color: '#fff', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', fontWeight: 'bold', animation: 'slideIn 0.3s ease-out' }}>
               {n.mensagem}
             </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
           <div style={{ background: corBarraTempo, color: '#fff', padding: '8px 15px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>
             {lojaFechada ? '🏪 LOJA FECHADA HOJE' : (appTravadoPorHorario ? '⏰ HORÁRIO ENCERRADO' : `⏳ ENCERRA ÀS ${horarioLimite}h`)}
           </div>

           <button onClick={abrirCentralNotificacoes} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '45px', height: '45px', borderRadius: '12px', position: 'relative' }}>
              <span style={{ fontSize: '20px' }}>🔔</span>
              {historicoNotificacoes.some(n => !n.lida) && <span style={{ position: 'absolute', top: 0, right: 0, width: '12px', height: '12px', background: configDesign.cores.alerta, borderRadius: '50%', border: '2px solid #fff' }}></span>}
           </button>
        </div>

        <div style={{ background: edicaoLiberada ? configDesign.cores.sucesso : (aguardandoLiberacao ? configDesign.cores.promocao : configDesign.cores.textoForte), color: isEscuro && !edicaoLiberada && !aguardandoLiberacao ? '#000' : '#fff', padding: '40px 30px', borderRadius: '30px', marginTop: '10px' }}>
          <div style={{fontSize: '50px', marginBottom: '10px'}}>{edicaoLiberada ? '🔓' : (aguardandoLiberacao ? '⏳' : '✅')}</div>
          <h2 style={{ margin: 0 }}>{edicaoLiberada ? 'EDIÇÃO LIBERADA' : (aguardandoLiberacao ? 'AGUARDANDO ADMIN' : 'PEDIDO ENVIADO!')}</h2>
        </div>
        
        <div style={{ textAlign: 'left', marginTop: '25px', background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', border: `1px solid ${configDesign.cores.borda}`, maxHeight: '40vh', overflowY: 'auto' }}>
          <h3 style={{ fontSize: '14px', color: configDesign.cores.textoSuave, marginBottom: '15px', marginTop: 0 }}>RESUMO DO PEDIDO:</h3>
          
          {listaEnviadaHoje.filter(i => i.nome_produto !== "⏰ PEDIDO ATRASADO").map((item, i) => (
            <div key={`resumo-${i}`} style={{ padding: '12px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <span style={{color: configDesign.cores.textoForte}}><b>{item.quantidade}x</b> {item.nome_produto} {item.qtd_bonificada > 0 && <span style={{color: configDesign.cores.sucesso, fontSize: '10px'}}>(🎁 {item.qtd_bonificada})</span>}</span><small style={{ color: configDesign.cores.textoSuave }}>{item.unidade_medida}</small>
              </div>
              
              {/* 💡 BOTÃO DE CORRIGIR ITEM SEMPRE APARECE PARA O CLIENTE SE NÃO ESTIVER EDITANDO O CARRINHO TODO */}
              {!edicaoLiberada && (
                 <div style={{ marginTop: '8px' }}>
                    {item.solicitou_edicao_item ? (
                       <span style={{ fontSize: '10px', color: configDesign.cores.promocao, fontWeight: 'bold' }}>⏳ Avaliando correção de quantidade...</span>
                    ) : (
                       <button onClick={() => abrirModalAjuste(item)} style={{ background: 'none', border: 'none', color: configDesign.cores.primaria, fontSize: '11px', fontWeight: 'bold', padding: 0, textDecoration: 'underline', cursor: 'pointer' }}>Corrigir quantidade</button>
                    )}
                 </div>
              )}
            </div>
          ))}
          {listaEnviadaHoje.filter(i => i.nome_produto !== "⏰ PEDIDO ATRASADO").length === 0 && <p style={{textAlign:'center', color: '#999'}}>Carrinho Vazio</p>}
        </div>

        <button onClick={copiarListaEnviada} style={{ marginTop: '15px', background: botaoCopiado ? configDesign.cores.sucesso : 'transparent', border: `1px solid ${botaoCopiado ? configDesign.cores.sucesso : configDesign.cores.borda}`, padding: '15px', borderRadius: '15px', color: botaoCopiado ? '#fff' : configDesign.cores.textoForte, fontWeight: 'bold', width: '100%', transition: '0.3s' }}>
           {botaoCopiado ? '✅ LISTA COPIADA!' : '📋 COPIAR MINHA LISTA'}
        </button>

        <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <button onClick={() => window.location.reload()} style={{ background: configDesign.cores.inputFundo, border: `1px solid ${configDesign.cores.borda}`, padding: '18px', borderRadius: '15px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>🔄 ATUALIZAR PÁGINA AGORA</button>
          
          {edicaoLiberada ? (
            <button onClick={importarParaCarrinho} style={{ background: configDesign.cores.sucesso, border: 'none', padding: '18px', borderRadius: '15px', color: '#fff', fontWeight: '900' }}>📥 PUXAR PARA O CARRINHO E EDITAR</button>
          ) : (
            <button onClick={aguardandoLiberacao ? null : pedirParaEditar} style={{ background: configDesign.cores.fundoCards, border: `2px solid ${aguardandoLiberacao ? configDesign.cores.borda : configDesign.cores.textoForte}`, padding: '18px', borderRadius: '15px', color: aguardandoLiberacao ? configDesign.cores.textoSuave : configDesign.cores.textoForte, fontWeight: 'bold' }}>
              {aguardandoLiberacao ? '⏳ SOLICITAÇÃO PENDENTE...' : (appTravadoPorHorario && !pediuAtraso ? '🔒 SOLICITAR ENVIO ATRASADO' : '✏️ ABRIR O CARRINHO INTEIRO DE NOVO')}
            </button>
          )}
          <button onClick={() => setModoVisualizacao(true)} style={{ background: 'transparent', border: 'none', padding: '20px', color: configDesign.cores.textoSuave, fontWeight: '900', textDecoration: 'underline' }}>VOLTAR AO INÍCIO (APENAS VISUALIZAR)</button>
        </div>

        {itemParaAjuste && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 5000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
             <div style={{ background: configDesign.cores.fundoCards, width: '100%', borderRadius: '25px', padding: '25px' }}>
                <h3 style={{ margin: '0 0 5px 0', color: configDesign.cores.textoForte, fontSize: '16px' }}>Nova quantidade para:</h3>
                <p style={{ color: configDesign.cores.primaria, fontWeight: '900', margin: '0 0 20px 0', fontSize: '18px' }}>{itemParaAjuste.nome_produto}</p>
                
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                   <span style={{fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.textoSuave}}>NOVA QTD:</span>
                   <button onClick={() => setNovaQtdItem(Math.max(1, novaQtdItem - 1))} style={{ width: '45px', height: '45px', fontSize: '20px', borderRadius: '12px', border: 'none', background: configDesign.cores.inputFundo, color: configDesign.cores.textoForte }}>-</button>
                   <input type="number" value={novaQtdItem} onChange={(e) => setNovaQtdItem(parseInt(e.target.value)||1)} style={{ width: '60px', height: '45px', fontSize: '20px', fontWeight: '900', textAlign: 'center', borderRadius: '12px', border: `2px solid ${configDesign.cores.primaria}`, outline: 'none', color: configDesign.cores.textoForte, background: configDesign.cores.fundoGeral }} />
                   <button onClick={() => setNovaQtdItem(novaQtdItem + 1)} style={{ width: '45px', height: '45px', fontSize: '20px', borderRadius: '12px', border: 'none', background: configDesign.cores.inputFundo, color: configDesign.cores.textoForte }}>+</button>
                </div>

                <div style={{ backgroundColor: temNovaBonif ? (isEscuro ? '#14532d' : '#dcfce7') : configDesign.cores.inputFundo, padding: '12px 15px', borderRadius: '12px', border: temNovaBonif ? '1px solid #86efac' : `1px solid ${configDesign.cores.borda}`, transition: '0.2s', marginBottom: '20px' }}>
                   <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: temNovaBonif ? (isEscuro ? '#86efac' : '#166534') : configDesign.cores.textoForte, fontWeight: '900', fontSize: '13px', cursor: 'pointer' }}>
                     <input type="checkbox" checked={temNovaBonif} onChange={(e) => { setTemNovaBonif(e.target.checked); if(!e.target.checked) setNovaBonifItem(0); }} style={{ width: '20px', height: '20px', accentColor: configDesign.cores.sucesso }} />
                     🎁 Manter/Incluir Bonificação
                   </label>
                   
                   {temNovaBonif && (
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: isEscuro ? '1px dashed #22c55e' : '1px dashed #86efac' }}>
                        <span style={{fontSize: '12px', fontWeight: 'bold', color: isEscuro ? '#86efac' : '#166534'}}>Qtd Bonificada:</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                           <button onClick={() => setNovaBonifItem(Math.max(0, novaBonifItem - 1))} style={{ width: '35px', height: '35px', fontSize: '18px', borderRadius: '8px', border: 'none', background: '#bbf7d0', color: '#166534' }}>-</button>
                           <input type="number" value={novaBonifItem} onChange={(e) => setNovaBonifItem(parseInt(e.target.value)||0)} style={{ width: '50px', height: '35px', fontSize: '16px', fontWeight: '900', textAlign: 'center', borderRadius: '8px', border: `1px solid #22c55e`, outline: 'none', color: '#166534', background: '#fff' }} />
                           <button onClick={() => setNovaBonifItem(novaBonifItem + 1)} style={{ width: '35px', height: '35px', fontSize: '18px', borderRadius: '8px', border: 'none', background: '#bbf7d0', color: '#166534' }}>+</button>
                        </div>
                     </div>
                   )}
                </div>

                <button onClick={enviarAjusteItem} style={{ width: '100%', padding: '15px', background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', marginBottom: '10px' }}>ENVIAR AVISO PARA CENTRAL</button>
                <button onClick={() => { setItemParaAjuste(null); }} style={{ width: '100%', padding: '15px', background: 'transparent', color: configDesign.cores.textoSuave, border: 'none', fontWeight: 'bold' }}>Cancelar</button>
             </div>
          </div>
        )}

        {modalNotificacoesAberto && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}>
            <div style={{ width: '300px', background: configDesign.cores.fundoCards, height: '100%', padding: '20px', display: 'flex', flexDirection: 'column', animation: 'slideLeft 0.3s', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${configDesign.cores.borda}`, paddingBottom: '15px' }}>
                 <h3 style={{ margin: 0, color: configDesign.cores.textoForte, fontSize: '18px' }}>Notificações</h3>
                 <button onClick={() => setModalNotificacoesAberto(false)} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontSize: '16px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>✕</button>
               </div>
               
               <div style={{ flex: 1, overflowY: 'auto', marginTop: '15px' }}>
                 {historicoNotificacoes.length === 0 ? (
                   <p style={{ color: configDesign.cores.textoSuave, textAlign: 'center', marginTop: '30px' }}>Nenhuma notificação recente.</p> 
                 ) : (
                   historicoNotificacoes.map(n => (
                     <div key={n.id} style={{ padding: '12px 0', borderBottom: `1px solid ${configDesign.cores.borda}` }}>
                       <div style={{ fontWeight: 'bold', fontSize: '11px', color: n.tipo === 'sucesso' ? configDesign.cores.sucesso : n.tipo === 'alerta' ? configDesign.cores.alerta : '#3b82f6' }}>{n.tipo.toUpperCase()}</div>
                       <div style={{ color: configDesign.cores.textoForte, fontSize: '13px', marginTop: '4px' }}>{n.mensagem}</div>
                       <div style={{ fontSize: '10px', color: configDesign.cores.textoSuave, marginTop: '6px' }}>{n.data}</div>
                     </div>
                   ))
                 )}
               </div>

               {historicoNotificacoes.length > 0 && (
                  <button onClick={() => setHistoricoNotificacoes([])} style={{ width: '100%', padding: '15px', background: configDesign.cores.inputFundo, color: configDesign.cores.textoForte, border: `1px solid ${configDesign.cores.borda}`, borderRadius: '12px', fontWeight: 'bold', marginTop: '10px' }}>
                    🗑️ Limpar Histórico
                  </button>
               )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =====================================================================
  // TELA 2: TELA PRINCIPAL DA LOJA (CATÁLOGO)
  // =====================================================================
  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: configDesign.cores.fundoGeral, fontFamily: configDesign.geral.fontePadrao, paddingBottom: '100px' }}>
      
      <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {notificacoes.map(n => (
           <div key={n.id} style={{ background: n.tipo === 'sucesso' ? configDesign.cores.sucesso : n.tipo === 'alerta' ? configDesign.cores.alerta : '#3b82f6', color: '#fff', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', fontWeight: 'bold', animation: 'slideIn 0.3s ease-out' }}>
             {n.mensagem}
           </div>
        ))}
      </div>

      <div style={{ background: (tempoExtra !== null && tempoExtra > 0) ? configDesign.cores.alerta : corBarraTempo, color: '#fff', padding: '8px', textAlign: 'center', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', zIndex: 1000, position: 'relative' }}>
         {(tempoExtra !== null && tempoExtra > 0) 
           ? `⏱️ TEMPO RESTANTE: ${Math.floor(tempoExtra / 60).toString().padStart(2, '0')}:${(tempoExtra % 60).toString().padStart(2, '0')}` 
           : avisoDiario}
      </div>

      <div style={{ padding: '25px 20px 15px 20px', backgroundColor: configDesign.cores.fundoCards, borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', color: configDesign.cores.textoForte, fontWeight: '900' }}>{saudacaoStr}, {primeiroNome}!</h2>
          <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: configDesign.cores.primaria, fontWeight: '900', textTransform: 'uppercase' }}>📍 {nomeLojaLimpo}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setModalConfiguracoesAberto(true)} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '40px', height: '40px', borderRadius: '12px', fontSize: '20px' }}>⚙️</button>
          <button onClick={abrirCentralNotificacoes} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '40px', height: '40px', borderRadius: '12px', position: 'relative' }}>
            <span style={{ fontSize: '20px' }}>🔔</span>
            {historicoNotificacoes.some(n => !n.lida) && <span style={{ position: 'absolute', top: 0, right: 0, width: '10px', height: '10px', background: configDesign.cores.alerta, borderRadius: '50%', border: '2px solid #fff' }}></span>}
          </button>
        </div>
      </div>

      {modalNotificacoesAberto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}>
          <div style={{ width: '300px', background: configDesign.cores.fundoCards, height: '100%', padding: '20px', display: 'flex', flexDirection: 'column', animation: 'slideLeft 0.3s', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${configDesign.cores.borda}`, paddingBottom: '15px' }}>
               <h3 style={{ margin: 0, color: configDesign.cores.textoForte, fontSize: '18px' }}>Notificações</h3>
               <button onClick={() => setModalNotificacoesAberto(false)} style={{ background: configDesign.cores.inputFundo, border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontSize: '16px', color: configDesign.cores.textoForte, fontWeight: 'bold' }}>✕</button>
             </div>
             
             <div style={{ flex: 1, overflowY: 'auto', marginTop: '15px' }}>
               {historicoNotificacoes.length === 0 ? (
                 <p style={{ color: configDesign.cores.textoSuave, textAlign: 'center', marginTop: '30px' }}>Nenhuma notificação recente.</p> 
               ) : (
                 historicoNotificacoes.map(n => (
                   <div key={n.id} style={{ padding: '12px 0', borderBottom: `1px solid ${configDesign.cores.borda}` }}>
                     <div style={{ fontWeight: 'bold', fontSize: '11px', color: n.tipo === 'sucesso' ? configDesign.cores.sucesso : n.tipo === 'alerta' ? configDesign.cores.alerta : '#3b82f6' }}>{n.tipo.toUpperCase()}</div>
                     <div style={{ color: configDesign.cores.textoForte, fontSize: '13px', marginTop: '4px' }}>{n.mensagem}</div>
                     <div style={{ fontSize: '10px', color: configDesign.cores.textoSuave, marginTop: '6px' }}>{n.data}</div>
                   </div>
                 ))
               )}
             </div>

             {historicoNotificacoes.length > 0 && (
                <button onClick={() => setHistoricoNotificacoes([])} style={{ width: '100%', padding: '15px', background: configDesign.cores.inputFundo, color: configDesign.cores.textoForte, border: `1px solid ${configDesign.cores.borda}`, borderRadius: '12px', fontWeight: 'bold', marginTop: '10px' }}>
                  🗑️ Limpar Histórico
                </button>
             )}
          </div>
        </div>
      )}

      {categoriaAtiva === 'DESTAQUES' && (
        <div style={{ backgroundColor: configDesign.cores.fundoGeral }}>
          <div style={{ width: '100%', height: '180px', backgroundImage: `url(${banners.topo})`, backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
          <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'flex-start', marginTop: '-40px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: `4px solid ${configDesign.cores.fundoGeral}`, backgroundImage: `url(${banners.logo})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundColor: '#fff' }}></div>
          </div>
          <div style={{ width: '100%', height: '140px', marginTop: '20px', backgroundImage: `url(${banners.tematico})`, backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
        </div>
      )}

      <div style={{ position: categoriaAtiva === 'DESTAQUES' ? 'relative' : 'fixed', top: categoriaAtiva === 'DESTAQUES' ? '0' : (navState.show ? '0' : '-100px'), left: 0, right: 0, zIndex: 100, backgroundColor: categoriaAtiva === 'DESTAQUES' ? configDesign.cores.fundoGeral : configDesign.cores.fundoCards, borderBottom: categoriaAtiva !== 'DESTAQUES' && navState.shrink ? `1px solid ${configDesign.cores.borda}` : 'none', transition: configDesign.animacoes.transicaoSuave, paddingTop: categoriaAtiva !== 'DESTAQUES' && navState.shrink ? '10px' : '20px', marginTop: categoriaAtiva === 'DESTAQUES' ? '15px' : '0' }}>
        <div style={{ padding: '0 20px 10px 20px' }}>
          <div style={{ backgroundColor: configDesign.cores.inputFundo, borderRadius: '12px', padding: (categoriaAtiva !== 'DESTAQUES' && navState.shrink) ? '8px 12px' : '12px', display: 'flex', gap: '10px' }}>
            <span>🔍</span><input placeholder="Procurar produto..." value={buscaMenu} onChange={e => setBuscaMenu(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', color: configDesign.cores.textoForte }} />
          </div>
        </div>
        <div style={{ display: 'flex', overflowX: 'auto', gap: '20px', padding: '0 20px', scrollbarWidth: 'none' }}>
          {categoriasDinamicas.map(cat => (
            <button key={cat} onClick={() => { setCategoriaAtiva(cat); window.scrollTo({top:0, behavior:'smooth'}); }} style={{ paddingBottom: '10px', whiteSpace: 'nowrap', fontWeight: '900', background: 'none', border: 'none', color: categoriaAtiva === cat ? configDesign.cores.primaria : configDesign.cores.textoSuave, borderBottom: categoriaAtiva === cat ? `3px solid ${configDesign.cores.primaria}` : 'none', cursor: 'pointer', fontSize: (categoriaAtiva !== 'DESTAQUES' && navState.shrink) ? '11px' : '13px' }}>{cat}</button>
          ))}
        </div>
      </div>
      <div style={{ height: categoriaAtiva === 'DESTAQUES' ? '10px' : '110px' }}></div>

      <div style={{ padding: '0 20px 20px 20px', display: 'grid', gridTemplateColumns: categoriaAtiva === 'DESTAQUES' ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
        {produtos.filter(p => {
          
          if (p.status === false) return false;

          const termoBuscado = removerAcentos(String(buscaMenu || '').toLowerCase().trim());
          const nomeProduto = removerAcentos(String(p.nome || '').toLowerCase());
          
          if (termoBuscado) {
            if (categoriaAtiva === '⭐ LISTA PADRÃO') return p.lista_padrao === true && nomeProduto.includes(termoBuscado);
            return nomeProduto.includes(termoBuscado);
          }

          if (categoriaAtiva === 'TODOS') return true;
          if (categoriaAtiva === 'DESTAQUES') return p.promocao || p.novidade;
          if (categoriaAtiva === '⭐ LISTA PADRÃO') return p.lista_padrao === true;
          
          return p.categoria && p.categoria.toUpperCase() === categoriaAtiva.replace(/[\u1000-\uFFFF]+/g, '').trim().toUpperCase();
        }).map(p => {
          const itemNoCarrinho = carrinhoSeguro.find(i => i.id === p.id);
          const infosVenda = tratarInfosDeVenda(p);
          
          let corBorda = configDesign.cores.fundoCards;
          let selo = null;
          let opacidade = 1;

          if (p.status_cotacao === 'falta') {
            corBorda = configDesign.cores.alerta;
            selo = <div style={{position: 'absolute', top: '-10px', right: '10px', background: corBorda, color: '#fff', fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', zIndex: 2 }}>EM FALTA</div>;
            opacidade = 0.6;
          } else if (p.status_cotacao === 'sem_preco') {
            corBorda = configDesign.cores.promocao;
            selo = <div style={{position: 'absolute', top: '-10px', right: '10px', background: corBorda, color: '#fff', fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', zIndex: 2 }}>SEM PREÇO HOJE</div>;
          } else if (p.promocao) { 
            corBorda = configDesign.cores.promocao; 
            selo = <div style={{position: 'absolute', top: '-10px', right: '10px', background: corBorda, color: '#fff', fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', zIndex: 2 }}>PROMOÇÃO</div>; 
          } else if (p.novidade) { 
            corBorda = configDesign.cores.novidade; 
            selo = <div style={{position: 'absolute', top: '-10px', right: '10px', background: corBorda, color: '#fff', fontSize: '9px', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', zIndex: 2 }}>NOVIDADE</div>; 
          } else if (itemNoCarrinho) {
            corBorda = configDesign.cores.primaria;
          }

          return (
            <div key={p.id} onClick={() => !isAppTravado && abrirProduto(p)} style={{ border: `2px solid ${corBorda}`, borderRadius: configDesign.cards.raioBorda, padding: '10px', cursor: isAppTravado ? 'default' : 'pointer', position: 'relative', backgroundColor: configDesign.cores.fundoCards, boxShadow: configDesign.cards.sombra, display: 'flex', flexDirection: 'column', gap: '8px', marginTop: selo ? '10px' : '0', opacity: opacidade }}>
               {selo}
               {itemNoCarrinho && !selo && <div style={{position: 'absolute', top: '-8px', right: '-8px', background: configDesign.cores.primaria, color: '#fff', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: '900', fontSize: '11px', border: `2px solid ${configDesign.cores.fundoCards}`, zIndex: 2}}>{itemNoCarrinho.quantidade}</div>}
               <div style={{ height: categoriaAtiva === 'DESTAQUES' ? configDesign.cards.alturaImgDestaque : configDesign.cards.alturaImgPequena, borderRadius: '8px', backgroundImage: `url(${(p.foto_url || '').split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: configDesign.cores.inputFundo }} />
               <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                 <strong style={{ fontSize: categoriaAtiva === 'DESTAQUES' ? '14px' : '11px', color: configDesign.cores.textoForte, lineHeight: '1.2', height: categoriaAtiva === 'DESTAQUES' ? 'auto' : '26px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                   {p.nome} {p.lista_padrao && '⭐'}
                 </strong>
                 {infosVenda.isCaixa && <small style={{fontSize: '9px', color: configDesign.cores.textoSuave, marginTop: '2px'}}>{infosVenda.textoSecundario}</small>}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto', paddingTop: '5px' }}>
                   <span style={{ color: configDesign.cores.primaria, fontWeight: '900', fontSize: categoriaAtiva === 'DESTAQUES' ? '18px' : '13px' }}>{infosVenda.textoPreco}</span>
                   <span style={{ fontSize: '10px', color: configDesign.cores.textoSuave, fontWeight: 'bold', background: configDesign.cores.inputFundo, padding: '2px 6px', borderRadius: '4px' }}>{itemNoCarrinho ? formatarQtdUnidade(itemNoCarrinho.quantidade, infosVenda.unidadeFinal) : infosVenda.unidadeFinal}</span>
                 </div>
               </div>
            </div>
          );
        })}
      </div>

      {/* 💡 BOTÃO DE SOLICITAÇÃO NA TELA INICIAL QUANDO TEMPO ESGOTA E NÃO TEM TEMPO EXTRA */}
      {appTravadoPorHorario && (tempoExtra === null || tempoExtra <= 0) && !listaEnviadaHoje && (
        <div style={{ padding: '0 20px 20px 20px' }}>
           <button onClick={pedirParaEditar} style={{ width: '100%', padding: '22px', backgroundColor: '#111', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
              ⏰ TEMPO ESGOTADO! SOLICITAR LIBERAÇÃO
           </button>
        </div>
      )}

      {modoVisualizacao && listaEnviadaHoje && (
        <button 
          onClick={() => setModoVisualizacao(false)} 
          style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', backgroundColor: configDesign.cores.sucesso, color: '#fff', border: 'none', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', fontSize: '24px', zIndex: 3000, cursor: 'pointer', transition: '0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
          📝 <span style={{ position: 'absolute', top: 0, right: 0, background: '#f8fafc', color: '#fff', fontSize: '11px', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: `2px solid ${configDesign.cores.sucesso}`, fontWeight: 'bold' }}>✓</span>
        </button>
      )}

      {carrinhoSeguro.length > 0 && !isAppTravado && (
        <button onClick={() => setModalCarrinhoAberto(true)} style={{ position: 'fixed', bottom: '25px', right: '25px', width: '65px', height: '65px', borderRadius: '50%', backgroundColor: configDesign.cores.textoForte, color: configDesign.cores.fundoGeral, border: 'none', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', fontSize: '24px', zIndex: 500, cursor: 'pointer' }}>
          🛒 <span style={{ position: 'absolute', top: 0, right: 0, background: configDesign.cores.primaria, color: '#fff', fontSize: '11px', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: `2px solid ${configDesign.cores.textoForte}`, fontWeight: 'bold' }}>{carrinhoSeguro.reduce((a,c)=>a+(Number(c?.quantidade)||0),0)}</span>
        </button>
      )}

      {modalConfiguracoesAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 6500, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: configDesign.cores.fundoCards, width: '100%', maxWidth: '320px', borderRadius: '25px', padding: '25px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: configDesign.cores.textoForte }}>Configurações</h3>
              <button onClick={() => setModalConfiguracoesAberto(false)} style={{ background: configDesign.cores.inputFundo, border: 'none', borderRadius: '50%', width: '35px', height: '35px', fontWeight: 'bold', color: configDesign.cores.textoForte }}>✕</button>
            </div>
            <button onClick={() => { setModalConfiguracoesAberto(false); setModalSenhaAberto(true); }} style={{ width: '100%', padding: '18px', background: configDesign.cores.fundoGeral, border: `1px solid ${configDesign.cores.borda}`, borderRadius: '15px', fontWeight: 'bold', color: configDesign.cores.textoForte, display: 'flex', alignItems: 'center', gap: '10px' }}>🔒 Alterar Minha Senha</button>
            {deferredPrompt && <button onClick={instalarApp} style={{ width: '100%', padding: '18px', background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '15px', fontWeight: 'bold', marginTop: '10px' }}>📲 Instalar App</button>}
          </div>
        </div>
      )}

      {modalSenhaAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 7000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div style={{ background: configDesign.cores.fundoCards, width: '100%', maxWidth: '350px', borderRadius: '25px', padding: '30px' }}>
            <h3 style={{ marginTop: 0, textAlign: 'center', color: configDesign.cores.textoForte, marginBottom: '20px' }}>Alterar Senha</h3>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.textoSuave, display: 'block', marginBottom: '5px' }}>Senha Antiga</label>
              <input type={mostrarSenha ? "text" : "password"} value={dadosSenha.antiga} onChange={e => setDadosSenha({...dadosSenha, antiga: e.target.value})} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}`, background: configDesign.cores.fundoGeral, color: configDesign.cores.textoForte, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.textoSuave, display: 'block', marginBottom: '5px' }}>Nova Senha</label>
              <input type={mostrarSenha ? "text" : "password"} value={dadosSenha.nova} onChange={e => setDadosSenha({...dadosSenha, nova: e.target.value})} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}`, background: configDesign.cores.fundoGeral, color: configDesign.cores.textoForte, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.textoSuave, display: 'block', marginBottom: '5px' }}>Repetir Nova Senha</label>
              <input type={mostrarSenha ? "text" : "password"} value={dadosSenha.confirma} onChange={e => setDadosSenha({...dadosSenha, confirma: e.target.value})} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: `1px solid ${configDesign.cores.borda}`, background: configDesign.cores.fundoGeral, color: configDesign.cores.textoForte, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <input type="checkbox" id="showPass" checked={mostrarSenha} onChange={() => setMostrarSenha(!mostrarSenha)} style={{ width: '18px', height: '18px', accentColor: configDesign.cores.primaria }} />
              <label htmlFor="showPass" style={{ fontSize: '13px', color: configDesign.cores.textoForte }}>Mostrar senhas</label>
            </div>
            {erroSenha && <div style={{ color: configDesign.cores.alerta, fontSize: '12px', fontWeight: 'bold', textAlign: 'center', marginBottom: '15px', background: isEscuro ? '#450a0a' : '#fef2f2', padding: '10px', borderRadius: '8px' }}>{erroSenha}</div>}
            <button onClick={salvarNovaSenha} disabled={carregandoSenha} style={{ width: '100%', padding: '18px', background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer' }}>{carregandoSenha ? 'SALVANDO...' : 'CONFIRMAR ALTERAÇÃO'}</button>
            <button onClick={() => { setModalSenhaAberto(false); setErroSenha(''); setDadosSenha({antiga:'', nova:'', confirma:''}); setMostrarSenha(false); }} style={{ width: '100%', marginTop: '10px', padding: '15px', background: 'transparent', color: configDesign.cores.textoSuave, border: 'none', fontWeight: 'bold' }}>Cancelar</button>
          </div>
        </div>
      )}

      {produtoExpandido && (() => {
        const infos = tratarInfosDeVenda(produtoExpandido);
        const qtdFinal = parseInt(quantidade) || 1;
        const bonifFinal = temBonificacao ? (parseInt(qtdBonificada) || 0) : 0;
        const bonificacaoSegura = Math.min(qtdFinal, bonifFinal);
        const qtdCobrada = Math.max(0, qtdFinal - bonificacaoSegura);
        const valorTotalCalc = infos.precoBase * qtdCobrada;
        const valorEconomia = infos.precoBase * bonificacaoSegura;

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setProdutoExpandido(null)} style={{ alignSelf: 'flex-end', margin: '20px', color: '#fff', fontSize: '28px', background: 'none', border: 'none' }}>✕</button>
            <div style={{ flex: 1, backgroundImage: `url(${(produtoExpandido.foto_url || '').split(',')[0]})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', margin: '20px' }} />
            
            <div style={{ backgroundColor: configDesign.cores.fundoCards, padding: '30px 20px', borderTopLeftRadius: '30px', borderTopRightRadius: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h2 style={{margin: 0, fontSize: '20px', color: configDesign.cores.textoForte, flex: 1}}>{produtoExpandido.nome}</h2>
                  <span style={{ fontSize: '12px', background: configDesign.cores.inputFundo, padding: '4px 10px', borderRadius: '8px', fontWeight: 'bold', color: configDesign.cores.textoForte }}>Vendido por {infos.unidadeFinal}</span>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingBottom: '15px', borderBottom: `1px dashed ${configDesign.cores.borda}` }}>
                  <div>
                    <span style={{ fontSize: '11px', color: configDesign.cores.textoSuave, fontWeight: 'bold', display: 'block' }}>Preço Unitário {infos.isCaixa && '(Caixa Fechada)'}</span>
                    <span style={{color: configDesign.cores.primaria, fontSize: '20px', fontWeight: '900'}}>{infos.textoPreco}</span>
                    {infos.isCaixa && <span style={{display: 'block', fontSize: '10px', color: configDesign.cores.textoSuave}}>{infos.textoSecundario}</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', color: configDesign.cores.textoSuave, fontWeight: 'bold', display: 'block' }}>Total a Pagar ({formatarQtdUnidade(qtdCobrada, infos.unidadeFinal)})</span>
                    <span style={{color: configDesign.cores.textoForte, fontSize: '24px', fontWeight: '900'}}>{formatarMoeda(valorTotalCalc)}</span>
                    {temBonificacao && bonificacaoSegura > 0 && (
                       <span style={{color: configDesign.cores.sucesso, fontSize: '11px', fontWeight: 'bold', display: 'block'}}>
                          Desconto: -{formatarMoeda(valorEconomia)}
                       </span>
                    )}
                  </div>
                </div>

                {!isAppTravado ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', margin: '20px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
                      <span style={{fontSize: '12px', fontWeight: 'bold', color: configDesign.cores.textoSuave}}>QTD. TOTAL:</span>
                      <button onClick={() => tratarInputQuantidade(Math.max(1, (parseInt(quantidade) || 0) - 1))} style={{ width: '45px', height: '45px', fontSize: '20px', borderRadius: '12px', border: 'none', background: configDesign.cores.inputFundo, color: configDesign.cores.textoForte }}>-</button>
                      <input type="number" value={quantidade} onChange={(e) => tratarInputQuantidade(e.target.value)} style={{ width: '60px', height: '45px', fontSize: '20px', fontWeight: '900', textAlign: 'center', borderRadius: '12px', border: `2px solid ${configDesign.cores.primaria}`, outline: 'none', color: configDesign.cores.textoForte, background: configDesign.cores.fundoCards }} />
                      <button onClick={() => tratarInputQuantidade((parseInt(quantidade) || 0) + 1)} style={{ width: '45px', height: '45px', fontSize: '20px', borderRadius: '12px', border: 'none', background: configDesign.cores.inputFundo, color: configDesign.cores.textoForte }}>+</button>
                    </div>

                    <div style={{ backgroundColor: temBonificacao ? (isEscuro ? '#14532d' : '#dcfce7') : configDesign.cores.inputFundo, padding: '12px 15px', borderRadius: '12px', border: temNovaBonif ? '1px solid #86efac' : `1px solid ${configDesign.cores.borda}`, transition: '0.2s' }}>
                       <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: temBonificacao ? (isEscuro ? '#86efac' : '#166534') : configDesign.cores.textoForte, fontWeight: '900', fontSize: '13px', cursor: 'pointer' }}>
                         <input type="checkbox" checked={temBonificacao} onChange={(e) => { setTemBonificacao(e.target.checked); if(!e.target.checked) setQtdBonificada(0); }} style={{ width: '20px', height: '20px', accentColor: configDesign.cores.sucesso }} />
                         🎁 INCLUIR BONIFICAÇÃO (Opção Loja)
                       </label>
                       
                       {temBonificacao && (
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: isEscuro ? '1px dashed #22c55e' : '1px dashed #86efac' }}>
                            <span style={{fontSize: '12px', fontWeight: 'bold', color: isEscuro ? '#86efac' : '#166534'}}>Qtd Bonificada:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                               <button onClick={() => tratarInputBonificacao(Math.max(0, (parseInt(qtdBonificada) || 0) - 1))} style={{ width: '35px', height: '35px', fontSize: '18px', borderRadius: '8px', border: 'none', background: '#bbf7d0', color: '#166534' }}>-</button>
                               <input type="number" value={qtdBonificada} onChange={(e) => tratarInputBonificacao(e.target.value)} style={{ width: '50px', height: '35px', fontSize: '16px', fontWeight: '900', textAlign: 'center', borderRadius: '8px', border: `1px solid #22c55e`, outline: 'none', color: '#166534', background: '#fff' }} />
                               <button onClick={() => tratarInputBonificacao((parseInt(qtdBonificada) || 0) + 1)} style={{ width: '35px', height: '35px', fontSize: '18px', borderRadius: '8px', border: 'none', background: '#bbf7d0', color: '#166534' }}>+</button>
                            </div>
                         </div>
                       )}
                    </div>

                    <button onClick={salvarNoCarrinho} style={{ width: '100%', padding: '22px', background: configDesign.cores.textoForte, color: configDesign.cores.fundoGeral, border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '15px' }}>
                      {carrinhoSeguro.find(i => i.id === produtoExpandido.id) ? 'ATUALIZAR QUANTIDADE' : 'ADICIONAR AO CARRINHO'}
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: '25px' }}>
                    {appTravadoPorHorario && (tempoExtra === null || tempoExtra <= 0) && (!listaEnviadaHoje) ? (
                       <button onClick={pedirParaEditar} style={{ width: '100%', padding: '22px', background: '#111', color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '13px', cursor: 'pointer' }}>
                         ⏰ TEMPO ESGOTADO! SOLICITAR LIBERAÇÃO
                       </button>
                    ) : (
                       <button disabled style={{ width: '100%', padding: '22px', background: isEscuro ? '#334155' : '#e2e8f0', color: isEscuro ? '#94a3b8' : '#94a3b8', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '13px' }}>
                         🔒 {modoVisualizacao ? 'PEDIDO JÁ ENVIADO' : 'AGUARDANDO LIBERAÇÃO DE PREÇOS'}
                       </button>
                    )}
                  </div>
                )}
            </div>
          </div>
        );
      })()}

      {modalCarrinhoAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh', backgroundColor: configDesign.cores.fundoCards, zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: '0', fontWeight: '900', color: configDesign.cores.textoForte }}>Meu Carrinho</h2>
            <button onClick={() => { setModalCarrinhoAberto(false); setItemEditandoId(null); }} style={{ border: 'none', background: configDesign.cores.inputFundo, borderRadius: '50%', width: '40px', height: '40px', fontWeight: 'bold', color: configDesign.cores.textoForte }}>✕</button>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {carrinhoSeguro.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 20px', color: configDesign.cores.textoSuave, fontWeight: 'bold' }}>Seu carrinho está vazio.</div>
            ) : (
              carrinhoSeguro.map((item) => (
                <div key={`cart-${item.id}`} style={{ padding: '15px 0', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {itemEditandoId === item.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                       <button onClick={() => alterarQtdCart(item.id, -1)} style={{width: '35px', height: '35px', borderRadius: '8px', border: 'none', background: configDesign.cores.inputFundo, fontSize: '18px', color: configDesign.cores.textoForte}}>-</button>
                       <input type="number" value={item.quantidade || 1} onChange={(e) => alterarQtdCartInput(item.id, e.target.value)} style={{ width: '45px', height: '35px', textAlign: 'center', fontWeight: '900', borderRadius: '8px', border: `1px solid ${configDesign.cores.borda}`, color: configDesign.cores.textoForte, background: configDesign.cores.fundoCards }} />
                       <button onClick={() => alterarQtdCart(item.id, 1)} style={{width: '35px', height: '35px', borderRadius: '8px', border: 'none', background: configDesign.cores.inputFundo, fontSize: '18px', color: configDesign.cores.textoForte}}>+</button>
                       <button onClick={() => setItemEditandoId(null)} style={{marginLeft: 'auto', background: configDesign.cores.sucesso, color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold'}}>OK</button>
                    </div>
                  ) : (
                    <div onClick={() => setItemEditandoId(item.id)} style={{ cursor: 'pointer', flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '13px', color: configDesign.cores.textoForte }}><b style={{color: configDesign.cores.primaria, fontSize: '15px'}}>{formatarQtdUnidade(item?.quantidade, item?.unidade_medida)}</b> de {item?.nome || 'Item'}</span>
                        <div style={{ fontSize: '11px', color: configDesign.cores.textoSuave, marginTop: '2px' }}>{formatarMoeda(item?.valorUnit)} / {item?.unidade_medida || 'UN'} • Toque para editar</div>
                        {item?.qtd_bonificada > 0 && <div style={{ fontSize: '10px', color: configDesign.cores.sucesso, fontWeight: 'bold', marginTop: '2px' }}>🎁 {item.qtd_bonificada} item(ns) bonificado(s)</div>}
                      </div>
                      <div style={{ fontWeight: '900', color: configDesign.cores.textoForte, fontSize: '14px' }}>{formatarMoeda(item?.total)}</div>
                    </div>
                  )}
                  {itemEditandoId !== item.id && ( <button onClick={() => setCarrinho(carrinhoSeguro.filter(i => i.id !== item.id))} style={{ color: configDesign.cores.alerta, border: 'none', background: 'none', fontWeight: 'bold', padding: '10px' }}>Remover</button> )}
                </div>
              ))
            )}
          </div>

          <div style={{ padding: '20px', borderTop: `1px solid ${configDesign.cores.borda}`, background: configDesign.cores.fundoGeral }}>
            {carrinhoSeguro.length > 0 && <button onClick={zerarCarrinho} style={{ width: '100%', padding: '12px', background: isEscuro ? '#450a0a' : '#fef2f2', color: configDesign.cores.alerta, border: 'none', borderRadius: '12px', fontWeight: '900', marginBottom: '15px' }}>🗑️ ESVAZIAR CARRINHO</button>}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontWeight: '900', fontSize: '18px', color: configDesign.cores.textoForte }}><span>Total Estimado:</span><span style={{color: configDesign.cores.primaria}}>{formatarMoeda(valorTotalCarrinho)}</span></div>
            <button onClick={abrirRevisao} style={{ width: '100%', padding: '22px', background: carrinhoSeguro.length > 0 ? configDesign.cores.textoForte : configDesign.cores.borda, color: configDesign.cores.fundoGeral, borderRadius: '18px', fontWeight: '900', fontSize: '15px', border: 'none' }}>REVISAR E ENVIAR</button>
          </div>
        </div>
      )}

      {modalRevisaoAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh', backgroundColor: configDesign.cores.fundoGeral, zIndex: 3000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: `1px solid ${configDesign.cores.borda}`, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <h3 style={{marginTop: 0, marginBottom: 0, textAlign: 'center', fontWeight: '900', color: configDesign.cores.textoForte}}>Confirmação do Pedido</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {carrinhoSeguro.map((item) => (
                  <div key={`rev-${item.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: `1px dashed ${configDesign.cores.borda}` }}>
                      <div>
                        <span style={{ fontSize: '13px', color: configDesign.cores.textoForte }}><b style={{color: configDesign.cores.primaria}}>{formatarQtdUnidade(item?.quantidade, item?.unidade_medida)}</b> de {item?.nome || 'Item'}</span>
                        <div style={{ fontSize: '11px', color: configDesign.cores.textoSuave, marginTop: '2px' }}>{formatarMoeda(item?.valorUnit)} / {item?.unidade_medida || 'UN'}</div>
                        {item?.qtd_bonificada > 0 && <div style={{ fontSize: '10px', color: configDesign.cores.sucesso, fontWeight: 'bold', marginTop: '2px' }}>🎁 {item.qtd_bonificada} Bonificado(s)</div>}
                      </div>
                      <span style={{fontWeight: 'bold', color: configDesign.cores.textoSuave}}>{formatarMoeda(item?.total)}</span>
                  </div>
              ))}
          </div>
          <div style={{ padding: '20px', borderTop: `1px solid ${configDesign.cores.borda}`, background: configDesign.cores.fundoCards }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', fontWeight: '900', fontSize: '20px', color: configDesign.cores.textoForte }}><span>TOTAL FINAL:</span><span style={{color: configDesign.cores.primaria}}>{formatarMoeda(valorTotalCarrinho)}</span></div>
             
             {/* 💡 BOTAO INTELIGENTE: Pede liberação se tempo esgotou */}
             {appTravadoPorHorario && (tempoExtra === null || tempoExtra <= 0) && (!listaEnviadaHoje || listaEnviadaHoje.length === 0) ? (
                 <button onClick={pedirParaEditar} disabled={enviandoPedido} style={{ width: '100%', padding: '20px', background: '#111', color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '14px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                   ⏰ TEMPO ESGOTADO! SOLICITAR LIBERAÇÃO
                 </button>
             ) : (
                 <button onClick={() => confirmarEnvio()} disabled={enviandoPedido} style={{ width: '100%', padding: '20px', background: configDesign.cores.sucesso, color: '#fff', border: 'none', borderRadius: '18px', fontWeight: '900', fontSize: '16px' }}>
                   {enviandoPedido ? 'ENVIANDO...' : 'CONFIRMAR ENVIO'}
                 </button>
             )}

             <button onClick={() => setModalRevisaoAberto(false)} style={{ width: '100%', background: 'none', border: 'none', marginTop: '15px', color: configDesign.cores.textoSuave, fontWeight: 'bold' }}>Voltar e editar carrinho</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>
  );
}