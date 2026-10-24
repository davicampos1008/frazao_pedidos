/*
  PlanilhaCompras comentado
  - Este arquivo mantém a mesma lógica da versão resumida.
  - Coment?rios explicam o que cada bloco altera: tela, estado, Supabase, totais, nota e WhatsApp.
  - N?o traduza nomes de APIs, hooks React, m?todos JavaScript ou campos do banco sem alterar todas as refer?ncias.
  - Campos como status_compra, fornecedor_compra, custo_unit e qtd_atendida vêm do Supabase e precisam manter o mesmo nome.
*/
// Importa React e hooks usados para controlar estado, efeitos de carregamento e callbacks.
import React, { useState, useEffect, useCallback } from 'react';
// Importa a conexão com Supabase; tudo que lê/grava pedidos, lojas e fornecedores passa por ela.
import { supabase } from './supabaseClient';

// Define a ordem fixa em que as lojas devem aparecer nas listas e notas.
const ORDEM_LOJAS = [
  "FLAMINGO", "PARANOÁ", "411", "404", "QE15", "QE30", 
  "QUALIDADE", "XEPA", "MANSÕES", "Q6", "VARJÃO", "215", "313", "307"
];

// Ordena qualquer lista de lojas usando ORDEM_LOJAS e priorizando FRAZÃO.
const ordenarLojas = (lojasArray) => {
  if (!Array.isArray(lojasArray)) return lojasArray;
  return [...lojasArray].sort((a, b) => {
    const nA = String(a.nome_fantasia || a.loja || a.nome || "").toUpperCase();
    const nB = String(b.nome_fantasia || b.loja || b.nome || "").toUpperCase();
    
    if (nA.includes('FRAZÃO')) return -1;
    if (nB.includes('FRAZÃO')) return 1;

    let iA = ORDEM_LOJAS.findIndex(nome => nA.includes(nome));
    let iB = ORDEM_LOJAS.findIndex(nome => nB.includes(nome));
    
    if (iA === -1) iA = 999;
    if (iB === -1) iB = 999;
    
    return iA - iB;
  });
};

// Componente principal da tela de compras; recebe o usuário para registrar alterações.
export default function PlanilhaCompras({ usuario }) {
  // Gera a data local no formato yyyy-mm-dd para filtrar os pedidos do dia.
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  // Estado da data escolhida; controla quais pedidos são carregados do Supabase.
  const [dataFiltro, setDataFiltro] = useState(() => {
    return localStorage.getItem('virtus_data_filtro') || obterDataLocal();
  });
  // Converte a data do filtro para dd/mm/yyyy, usada em títulos, avisos e PDF.
  const dataBr = dataFiltro.split('-').reverse().join('/');

  // Controla qual aba está aberta: pendentes, seleção, agrupados, feitos, fornecedores ou resumo.
  const [abaAtiva, setAbaAtiva] = useState('pendentes'); 
  // Indica carregamento inicial ou operações que mexem no banco.
  const [carregando, setCarregando] = useState(true);
  
  // Texto de busca da aba de pendentes.
  const [buscaPendentes, setBuscaPendentes] = useState('');
  // Texto de busca da aba de itens feitos.
  const [buscaFeitos, setBuscaFeitos] = useState('');
  // Texto de busca na lista de fornecedores fechados.
  const [buscaFornecedores, setBuscaFornecedores] = useState('');
  // Texto de busca no resumo geral de itens.
  const [buscaFornList, setBuscaFornList] = useState(''); 
  // Texto de busca ao selecionar itens para agrupar por fornecedor.
  const [buscaSelecionar, setBuscaSelecionar] = useState(''); 

  // Guarda, por fornecedor, o que foi enviado por loja (foto), se o envio está completo e se foi conferido. Salvo por data.
 // Registro compartilhado de envios por fornecedor (vem do Supabase): completo, conferido, para2Ok e foto das lojas.
const [enviosForn, setEnviosForn] = useState({});
// Data a que pertencem os dados carregados; evita gravar dados de uma data em outra ao trocar o filtro.
const [dataCarregada, setDataCarregada] = useState(null);

  // Filtro ativo no guia da aba Fornecedores: 'todos' ou uma categoria.
  const [filtroForn, setFiltroForn] = useState('todos');
  
  // Define se a busca de pendentes procura por produto ou loja.
  const [tipoBuscaPendentes, setTipoBuscaPendentes] = useState('produto');
  // Define se a busca da seleção procura por produto ou loja.
  const [tipoBuscaSelecionar, setTipoBuscaSelecionar] = useState('produto');

  // Lista agrupada dos pedidos ainda pendentes por produto.
  const [demandas, setDemandas] = useState([]); 
  // Lista agrupada dos pedidos já resolvidos, comprados, boleto ou falta.
  const [pedidosFeitos, setPedidosFeitos] = useState([]); 
  // Cópia bruta dos pedidos do Supabase; usada para clonar/restaurar restos.
  const [pedidosRaw, setPedidosRaw] = useState([]); 
  // Fornecedores processados com totais por loja, Pix, boleto e descontos.
  const [fornecedoresBd, setFornecedoresBd] = useState([]);
  // Cadastro de lojas carregado do Supabase e ordenado.
  const [lojasBd, setLojasBd] = useState([]);
  // Cadastro de produtos usado para sugestáo de preço, unidade e nome no WhatsApp.
  const [produtosBd, setProdutosBd] = useState([]); 
  
  // Resumo geral por item: solicitado, comprado, pendente, falta e fornecedor.
  const [listaGeralItens, setListaGeralItens] = useState([]);
  // Guarda qual card do resumo está aberto para mostrar fornecedores comprados.
  const [itemResumoExpandido, setItemResumoExpandido] = useState(null);
  // Abre/fecha a visualização que vira PDF do resumo.
  const [modoImpressaoResumo, setModoImpressaoResumo] = useState(false);

  // Item aberto no modal de compra unitária/fracionada; null fecha o modal.
  const [itemModal, setItemModal] = useState(null);
  // Alterna o modal entre pedido completo e pedido fracionado.
  const [abaModal, setAbaModal] = useState('completo'); 
  
  // Formulário do modal: fornecedor, preço, quantidade, falta, bonificação e crédito.
  const [dadosCompra, setDadosCompra] = useState({ 
    fornecedor: '', valor_unit: '', qtd_pedir: '', isFaltaGeral: false, qtdFornecedor: '', temBonificacao: false, isCredito: false 
  });
  // Lojas que participam do item aberto no modal e suas quantidades individuais.
  const [lojasEnvolvidas, setLojasEnvolvidas] = useState([]);

  // Fornecedor expandido na aba de fornecedores.
  const [fornExpandido, setFornExpandido] = useState(null);
  // Controla qual loja está aberta dentro do pedido geral por fornecedor.
  const [lojaGeralSelecionada, setLojaGeralSelecionada] = useState({});

  // Marca, por fornecedor, se o pedido geral deve sair no formato *TOTAL*.
  const [enviarTotalPorForn, setEnviarTotalPorForn] = useState({});
  // Dentro do formato *TOTAL*, marca se deve sair sem valores e sem total (boleto).
  const [semTotalPorForn, setSemTotalPorForn] = useState({});

  // Marca CEASA ou CEILÂNDIA para montar o complemento do WhatsApp.
  const [localCompra, setLocalCompra] = useState(''); 

  // Itens marcados para formar grupos de compra por fornecedor.
  const [itensSelecionados, setItensSelecionados] = useState([]);
  // Nome do fornecedor usado ao criar agrupamento simples em lote.
  const [nomeFornecedorLote, setNomeFornecedorLote] = useState('');

  // Abre o modal que separa itens por fornecedor e por loja.
  const [modalFracionarLoteAberto, setModalFracionarLoteAberto] = useState(false);
  // Lojas disponíveis para receber fornecedor no fracionamento em lote.
  const [fracionarLojasDisp, setFracionarLojasDisp] = useState([]); 
  // Lojas escolhidas dentro do modal de fracionamento em lote.
  const [fracionarLojasSelecionadas, setFracionarLojasSelecionadas] = useState([]); 
  // Fornecedor digitado para atribuir às lojas selecionadas no fracionamento.
  const [fracionarFornecedor, setFracionarFornecedor] = useState('');
  // Mapa loja -> fornecedor usado para criar grupos separados corretamente.
  const [fracionarAtribuicoes, setFracionarAtribuicoes] = useState({}); // Mapeia { lojaId: fornecedor }
  
  // Grupos de itens por fornecedor; ficam salvos no localStorage por data.
  const [agrupamentos, setAgrupamentos] = useState(() => {
    try {
      const salvo = localStorage.getItem(`agrupamentos_virtus_${dataFiltro}`);
      return salvo ? JSON.parse(salvo) : [];
    } catch (e) { return []; }
  });
  // Preços digitados para finalizar grupos de fornecedor.
  const [precosAgrupados, setPrecosAgrupados] = useState({});
  // Grupo aberto na aba de pedidos agrupados.
  const [grupoExpandido, setGrupoExpandido] = useState(null);
  
  // Nomes alternativos de produtos usados apenas nas mensagens de WhatsApp.
  const [nomesPersonalizados, setNomesPersonalizados] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nomes_personalizados_virtus')) || {}; } catch(e){ return {}; }
  });
  // Fornecedor aberto no modal de nomes personalizados para WhatsApp.
  const [modalNomesFornecedor, setModalNomesFornecedor] = useState(null);

  // Fila de avisos temporários exibidos no topo da tela.
  const [notificacoes, setNotificacoes] = useState([]);

  // Cadastro oficial de fornecedores, usado para validar nomes digitados.
  const [fornecedoresOficiais, setFornecedoresOficiais] = useState([]);
  // Indica qual fornecedor está com nome em edição.
  const [editandoNomeForn, setEditandoNomeForn] = useState(null);
  // Valor digitado ao renomear fornecedor.
  const [novoNomeForn, setNovoNomeForn] = useState('');
  // Item expandido na aba de feitos.
  const [expandidoFeito, setExpandidoFeito] = useState(null);

  // Abre o modal para lançar item manual nas lojas.
  const [modalAdicionarItem, setModalAdicionarItem] = useState(false);
  // Produto escolhido/digitado no modal de item manual.
  const [novoItemBusca, setNovoItemBusca] = useState('');
  // Quantidades por loja do item manual.
  const [novoItemLojas, setNovoItemLojas] = useState({});

  // Carrega a biblioteca externa html2pdf somente se ela ainda não estiver no navegador.
  useEffect(() => {
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // Salva a data escolhida para manter o filtro quando a página for recarregada.
  useEffect(() => {
    localStorage.setItem('virtus_data_filtro', dataFiltro);
  }, [dataFiltro]);

  // Recarrega os agrupamentos salvos sempre que a data muda.
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(`agrupamentos_virtus_${dataFiltro}`);
      setAgrupamentos(salvo ? JSON.parse(salvo) : []);
    } catch(e) { setAgrupamentos([]); }
  }, [dataFiltro]);

  // Persiste os agrupamentos da data atual no navegador.
  useEffect(() => {
    localStorage.setItem(`agrupamentos_virtus_${dataFiltro}`, JSON.stringify(agrupamentos));
  }, [agrupamentos, dataFiltro]);

  // Persiste os nomes personalizados usados nas mensagens de WhatsApp.
  useEffect(() => {
    localStorage.setItem('nomes_personalizados_virtus', JSON.stringify(nomesPersonalizados));
  }, [nomesPersonalizados]);

  // Remove acentos e símbolos para comparar buscas e nomes sem erro por grafia.

  const removerAcentos = (str) => {
    if (!str) return '';
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") 
      .replace(/[^a-zA-Z0-9]/g, '')    
      .toLowerCase();
  };

  // Quando todas as lojas foram enviadas, marca os pedidos ativos como envio completo.
  // Também corrige pedidos antigos que ainda não tinham os campos de rastreamento preenchidos.
  useEffect(() => {
    if (dataCarregada !== dataFiltro) return;
    fornecedoresBd.forEach(f => {
      const lojasArr = Object.values(f.lojas);
      const todas = lojasArr.length > 0 && lojasArr.every(l => l.wpp_enviado);
      if (!todas) return;

      const ativos = pedidosAtivosForn(f.nome);
      const faltandoCompleto = ativos.filter(p => !p.envio_completo);
      if (faltandoCompleto.length > 0) {
        const ps = faltandoCompleto.map(p => supabase.from('pedidos').update({
          envio_completo: true,
          ...(!p.forn_enviado ? { forn_enviado: f.nome, qtd_enviada: Number(p.qtd_atendida) || 0 } : {})
        }).eq('id', p.id));
        Promise.all(ps).then(() => carregarDados(true));
      }
    });
  }, [fornecedoresBd, enviosForn, dataCarregada, dataFiltro]);



  // Extrai números de códigos vindos como texto; usado para comparar loja_id/codigo_loja.

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros !== '' ? parseInt(apenasNumeros, 10) : null;
  };

  // Converte moeda em número para calcular totais da nota.

  const tratarPrecoNum = (p) => parseFloat(String(p || '0').replace('R$', '').trim().replaceAll('.', '').replace(',', '.')) || 0;
  // Converte número para moeda brasileira exibida na tela.
  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Padroniza unidade exibida; KG vira CX conforme regra atual do app.

  const formatarUnidade = (und) => {
    const u = String(und || 'UN').toUpperCase();
    return u === 'KG' ? 'CX' : u;
  };

  // Coloca nomes de produto em formato de título para exibição.

  const formatarNomeItem = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  // Remove observações entre parênteses antes de montar mensagem para WhatsApp.

  const limparNomeParaWhatsapp = (str) => {
    return str.replace(/\s*\(.*?\)\s*/g, '').trim().toUpperCase();
  };

  // Mostra aviso temporário na tela após salvar, cancelar, faltar ou copiar mensagem.

  const mostrarNotificacao = (mensagem, tipo = 'info') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 3000);
  };


// Tira uma "foto" da loja: { NOME_DO_ITEM: quantidade }.
const tirarFotoLoja = (loja) => {
  const foto = {};
  loja.itens.forEach(i => { foto[i.nome] = (foto[i.nome] || 0) + Number(i.qtd || 0); });
  return foto;
};

// Quando todas as lojas de um fornecedor já foram copiadas, marca o envio como completo e guarda a foto atual.
// Edições feitas antes desse momento não geram aviso.
useEffect(() => {
  setEnviosForn(prev => {
    let mudou = false;
    const novo = { ...prev };
    fornecedoresBd.forEach(f => {
      const lojasArr = Object.values(f.lojas);
      const todas = lojasArr.length > 0 && lojasArr.every(l => l.wpp_enviado);
      if (todas && !(novo[f.nome] && novo[f.nome].completo)) {
        const lojasSnap = {};
        lojasArr.forEach(l => { lojasSnap[l.nome] = tirarFotoLoja(l); });
        novo[f.nome] = { ...(novo[f.nome] || {}), completo: true, conferido: false, lojas: lojasSnap };
        mudou = true;
      }
    });
    return mudou ? novo : prev;
  });
}, [fornecedoresBd]);

// Compara o pedido atual do fornecedor com o que foi enviado e diz quais lojas mudaram.
const calcularModificacoes = (f) => {
  const resultado = { lojas: {}, removidas: [] };
  const reg = enviosForn[f.nome];
  if (!reg || !reg.completo) return resultado;
  const lojasSnap = reg.lojas || {};

  Object.values(f.lojas).forEach(loja => {
    const atual = tirarFotoLoja(loja);
    const antiga = lojasSnap[loja.nome];
    if (!antiga) {
      resultado.lojas[loja.nome] = { tipo: 'NOVA LOJA', detalhes: Object.entries(atual).map(([n, q]) => `+${q} ${n}`) };
      return;
    }
    const detalhes = [];
    let add = false, red = false;
    Object.keys({ ...antiga, ...atual }).sort().forEach(nome => {
      const dif = Math.round(((atual[nome] || 0) - (antiga[nome] || 0)) * 1000) / 1000;
      if (dif > 0) { add = true; detalhes.push(`+${dif} ${nome}`); }
      else if (dif < 0) { red = true; detalhes.push(`${dif} ${nome}`); }
    });
    if (detalhes.length > 0) {
      resultado.lojas[loja.nome] = { tipo: add && red ? 'ALTERADA' : (add ? 'ADICIONADO' : 'REDUZIDO'), detalhes };
    }
  });

  Object.keys(lojasSnap).forEach(nomeLoja => {
    if (!f.lojas[nomeLoja]) {
      resultado.removidas.push({ nome: nomeLoja, detalhes: Object.entries(lojasSnap[nomeLoja]).map(([n, q]) => `-${q} ${n}`) });
    }
  });
  return resultado;
};

// Registra um envio: de uma ou mais lojas, ou do pedido geral (que atualiza todas).
// Registra um envio no banco: marca enviado, guarda a "foto" (qtd_enviada) e limpa conferência se houve mudança.
const registrarEnvio = async (f, geral, nomesLojas = []) => {
  const mods = calcularModificacoes(f);
  const houveMod = Object.keys(mods.lojas).length > 0 || mods.removidas.length > 0;
  const daLoja = (p) => geral || nomesLojas.includes(nomeLojaDoPedido(p));
  const ativos = pedidosAtivosForn(f.nome);
  const idsAtivos = new Set(ativos.map(p => p.id));
  const promessas = [];

  ativos.filter(daLoja).forEach(p => promessas.push(
    supabase.from('pedidos').update({ wpp_enviado: true, qtd_enviada: Number(p.qtd_atendida) || 0, forn_enviado: f.nome }).eq('id', p.id)
  ));

  // Pedidos que saíram deste fornecedor: esquece o que foi enviado deles.
  pedidosRaw.filter(p => String(p.forn_enviado || '').toUpperCase().trim() === f.nome && !idsAtivos.has(p.id) && daLoja(p))
    .forEach(p => promessas.push(supabase.from('pedidos').update({ qtd_enviada: 0, forn_enviado: '' }).eq('id', p.id)));

  if (houveMod && ativos.length > 0) {
    promessas.push(supabase.from('pedidos').update({ conferido: false, para2_ok: false }).in('id', ativos.map(p => p.id)));
  }

  await Promise.all(promessas);
  carregarDados(true);
};
// Liga/desliga a conferência.
const alternarConferencia = (nomeForn) => {
  const novo = !(enviosForn[nomeForn] && enviosForn[nomeForn].conferido);
  salvarFlagsForn(nomeForn, { conferido: novo }, { conferido: novo });
};


// Preço curto de um item do fornecedor para o resumo do topo (ex.: R$10 ou R$7,50).
const precoCurtoResumo = (f, nomeItem) => {
  for (const loja of Object.values(f.lojas)) {
    const it = loja.itens.find(i => i.nome === nomeItem);
    if (it) {
      if (it.isBoleto) return 'BOL';
      const n = tratarPrecoNum(it.valor_unit);
      if (!n) return '';
      return `R$${n % 1 === 0 ? n : n.toFixed(2).replace('.', ',')}`;
    }
  }
  return '';
}; 

// Diz se o fornecedor (cadastro oficial) exige envio para 2 pessoas (coluna enviar_para_2).
const fornecedorEnviaPara2 = (f) => {
  const oficial = fornecedoresOficiais.find(o =>
    String(o.nome_fantasia || '').toUpperCase().trim() === f.nome ||
    String(o.nome_completo || '').toUpperCase().trim() === f.nome
  );
  return !!oficial && (oficial.enviar_para_2 === true || String(oficial.enviar_para_2).toLowerCase() === 'true');
};

// Nome da pessoa do segundo envio (coluna segundo_envio do cadastro do fornecedor).
const nomeSegundoEnvio = (f) => {
  const oficial = fornecedoresOficiais.find(o =>
    String(o.nome_fantasia || '').toUpperCase().trim() === f.nome ||
    String(o.nome_completo || '').toUpperCase().trim() === f.nome
  );
  return oficial && oficial.segundo_envio ? String(oficial.segundo_envio).trim() : '';
};

// Marca/desmarca "enviado para a 2ª pessoa". Desmarcar também desfaz a conferência.
const alternarPara2 = (nomeForn) => {
  const novoOk = !(enviosForn[nomeForn] && enviosForn[nomeForn].para2Ok);
  salvarFlagsForn(
    nomeForn,
    novoOk ? { para2_ok: true } : { para2_ok: false, conferido: false },
    novoOk ? { para2Ok: true } : { para2Ok: false, conferido: false }
  );
};


// Situação de envio/conferência de um fornecedor (usada no resumo final).
const statusEnvioForn = (f) => {
  const lojasArr = Object.values(f.lojas);
  const todas = lojasArr.length > 0 && lojasArr.every(l => l.wpp_enviado);
  const mods = calcularModificacoes(f);
  const reenviar = Object.keys(mods.lojas).length > 0 || mods.removidas.length > 0;
  const enviado = todas && !reenviar;
  const conferido = enviado && !!(enviosForn[f.nome] && enviosForn[f.nome].conferido);
  return { enviado, conferido };
};

// Monta o resumo da conferência concluída e copia para a área de transferência.
const gerarResumoConferencia = () => {
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : (hora < 18 ? 'Boa tarde' : 'Boa noite');

  const ativos = fornecedoresBd.filter(f => Object.keys(f.lojas).length > 0);
  const todosEnviados = ativos.length > 0 && ativos.every(f => statusEnvioForn(f).enviado);
  const todosConferidos = ativos.length > 0 && ativos.every(f => statusEnvioForn(f).conferido);
  // Conferido implica enviado.
  const marcaEnviados = todosEnviados || todosConferidos;

  const paraDois = ativos.filter(f => fornecedorEnviaPara2(f));

  let msg = `${saudacao},\n\n`;
  msg += `*Pedidos Enviados:* ${marcaEnviados ? '✅' : '❌'}\n`;
  msg += `*Pedidos Conferidos:* ${todosConferidos ? '✅' : '❌'}\n\n`;
  msg += `*Lista de fornecedores enviados para 2*\n\n`;

  if (paraDois.length === 0) {
    msg += `Nenhum fornecedor hoje`;
  } else {
    paraDois.forEach(f => {
      const n2 = nomeSegundoEnvio(f);
      const envio2Ok = !!(enviosForn[f.nome] && enviosForn[f.nome].para2Ok);
      msg += `${f.nome}${n2 ? '/' + n2 : ''}: ${envio2Ok ? '✅' : '❌'}\n`;
    });
  }

  navigator.clipboard.writeText(msg.trim());
  mostrarNotificacao('✅ Resumo da conferência copiado!', 'sucesso');
};

// Classifica o fornecedor na mesma ordem de prioridade das bordas: reenviar > alerta > conferido > enviado > não enviado.
const categoriaForn = (f) => {
  const lojasArr = Object.values(f.lojas);
  const todasCopiadas = lojasArr.length > 0 && lojasArr.every(l => l.wpp_enviado);
  const mods = calcularModificacoes(f);
  const reenviar = Object.keys(mods.lojas).length > 0 || mods.removidas.length > 0;
  const conferido = !!(enviosForn[f.nome] && enviosForn[f.nome].conferido) && todasCopiadas && !reenviar;
  if (reenviar) return 'reenviar';
  if (f.precisaRefazer) return 'alerta';
  if (conferido) return 'conferido';
  if (todasCopiadas) return 'enviado';
  return 'nao_enviado';
};

// Fornecedor que exige envio para 2 pessoas e ainda não foi marcado.
const pendentePara2 = (f) => fornecedorEnviaPara2(f) && !(enviosForn[f.nome] && enviosForn[f.nome].para2Ok);

// Define as abas do guia, na ordem de exibição.
const ABAS_FORN = [
  { id: 'nao_enviado', label: '⚪ Não enviados', cor: '#64748b', fundo: '#f1f5f9' },
  { id: 'reenviar', label: '🔁 Reenviar', cor: '#ea580c', fundo: '#ffedd5' },
  { id: 'alerta', label: '⚠️ Alerta', cor: '#ef4444', fundo: '#fef2f2' },
  { id: 'para2', label: '👥 Enviar p/ 2', cor: '#7c3aed', fundo: '#ede9fe' },
  { id: 'enviado', label: '✅ Enviados', cor: '#16a34a', fundo: '#dcfce7' },
  { id: 'conferido', label: '🔵 Conferidos', cor: '#1d4ed8', fundo: '#dbeafe' },
];

// Confere se o fornecedor pertence a uma aba.
const pertenceAba = (f, abaId) => abaId === 'todos' || (abaId === 'para2' ? pendentePara2(f) : categoriaForn(f) === abaId);

// Se a aba escolhida ficar vazia (ex.: tudo foi reenviado), volta para "Todos".
useEffect(() => {
  if (filtroForn !== 'todos' && !fornecedoresBd.some(f => pertenceAba(f, filtroForn))) {
    setFiltroForn('todos');
  }
}, [fornecedoresBd, enviosForn, fornecedoresOficiais, filtroForn]);

  // Confere se o fornecedor existe; se não existir, pede confirmação antes de lançar.

  const verificarFornecedorCadastrado = (nomeDigitado) => {
    const nomeUpper = nomeDigitado.toUpperCase().trim();
    const nomeLimpo = removerAcentos(nomeUpper);
    
    const fornecedorOficial = fornecedoresOficiais.find(f => 
      removerAcentos(f.nome_fantasia) === nomeLimpo || 
      removerAcentos(f.nome_completo) === nomeLimpo
    );
    
    if (fornecedorOficial) {
        return (fornecedorOficial.nome_fantasia || fornecedorOficial.nome_completo).toUpperCase().trim();
    }
    
    if (!window.confirm(`⚠️ O fornecedor "${nomeUpper}" NÃO ESTÁ CADASTRADO no sistema.\n\nDeseja lançar assim mesmo? Ele ficará com um alerta vermelho na tela de Fechamentos para ser cadastrado depois.`)) {
      return false;
    }
    return nomeUpper; 
  };

  // Calcula preço sugerido considerando peso de caixa quando o produto for KG.

  const calcularPrecoFinalSugestao = (nomeProduto) => {
      const prod = produtosBd.find(p => String(p.nome).toUpperCase() === String(nomeProduto).toUpperCase());
      if (!prod || !prod.preco) return 'R$ 0,00';
      
      let pUnit = parseFloat(String(prod.preco).replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
      let precoFinalItem = pUnit;

      const temPesoExtra = prod.peso_caixa && String(prod.peso_caixa).trim() !== '';
      const numeroPeso = temPesoExtra ? parseFloat(String(prod.peso_caixa).replace(/[^\d.]/g, '')) : 0;
      
      if (prod.unidade_medida === 'KG' && temPesoExtra && numeroPeso > 0) {
          precoFinalItem = pUnit * numeroPeso;
      }
      return formatarMoeda(precoFinalItem);
  };

  // Marca falta para itens dentro de um grupo e remove o item daquele grupo.

  const marcarFaltaDoAgrupamento = async (nomeItem, lojasDoItem, grupoId) => {
      if(!window.confirm(`Deseja marcar FALTA para o item "${nomeItem}" nas lojas selecionadas deste grupo?`)) return;
      setCarregando(true);
      
      const promessas = lojasDoItem.map(l => supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', l.id_pedido));
      await Promise.all(promessas);
      
      setAgrupamentos(prev => prev.map(g => {
          if (g.id === grupoId) return { ...g, itens: g.itens.filter(i => i !== nomeItem) };
          return g;
      }).filter(g => g.itens.length > 0)); 
      
      mostrarNotificacao(`🚫 Falta marcada para ${nomeItem}.`, 'info');
      carregarDados(true);
      setCarregando(false);
  };

  // Cancela um item já lançado em fornecedor e devolve para pendentes.

  const cancelarItemUnicoDoFornecedor = async (idPedido, nomeItem) => {
    if (!window.confirm(`Deseja cancelar a compra de "${nomeItem}" desta loja?\nEle voltará para a aba de PENDENTES.`)) return;
    setCarregando(true);
    await supabase.from('pedidos').update({
      status_compra: 'pendente',
      fornecedor_compra: '',
      custo_unit: '',
      qtd_atendida: 0,
      qtd_bonificada: 0,
      wpp_enviado: false,
      conferido: false,
      para2_ok: false
    }).eq('id', idPedido);
    carregarDados();
  };

  // Remove bonificação pedida pela loja e ajusta a quantidade conforme escolha do usuário.

  const rejeitarBonificacaoCliente = async () => {
     setCarregando(true);
     const promessas = [];
     let novasLojasEnvolvidas = [...lojasEnvolvidas];

     for (let loja of itemModal.lojas.filter(l => l.qtd_bonificada_cliente > 0)) {
         const cobrada = Number(loja.qtd_pedida) || 0;
         const bonificada = Number(loja.qtd_bonificada_cliente) || 0;
         const totalBruto = cobrada + bonificada;

         const msg = `A loja ${loja.nome_fantasia} pediu:\n- ${cobrada} pagas\n- ${bonificada} bonificadas\n\nTotal: ${totalBruto} itens.\n\nAo recusar a bonificação, o que você deseja fazer?\n\n[OK] = Enviar os ${totalBruto} itens, mas COBRAR por todos.\n[CANCELAR] = Enviar apenas os ${cobrada} itens originais.`;

         const querTotalBruto = window.confirm(msg);
         const novaQtd = querTotalBruto ? totalBruto : cobrada;

         promessas.push(supabase.from('pedidos').update({ qtd_bonificada: 0, quantidade: novaQtd }).eq('id', loja.id_pedido));

         const index = novasLojasEnvolvidas.findIndex(l => l.id_pedido === loja.id_pedido);
         if (index !== -1) {
             novasLojasEnvolvidas[index].qtd_pedida = novaQtd;
             if (novasLojasEnvolvidas[index].qtd_receber === cobrada) {
                 novasLojasEnvolvidas[index].qtd_receber = novaQtd;
             }
             novasLojasEnvolvidas[index].qtd_bonificada_cliente = 0;
         }
     }

     await Promise.all(promessas);
     setItemModal(prev => ({...prev, qtd_bonificada_cliente: 0}));
     setLojasEnvolvidas(novasLojasEnvolvidas);
     mostrarNotificacao('❌ Bonificação recusada e pedidos ajustados.', 'info');
     carregarDados(true);
     setCarregando(false);
  };

  // Remove bonificação de vários itens dentro de um grupo.

  const rejeitarBonificacaoGrupo = async (nomeItem, lojasDoItem) => {
     setCarregando(true);
     const promessas = [];

     const lojasComBonificacao = lojasDoItem.filter(l => l.qtd_bonificada_cliente > 0);

     if (lojasComBonificacao.length === 0) {
         if(!window.confirm(`Deseja recusar a bonificação de ${nomeItem}?`)) { setCarregando(false); return; }
         const promessasBasicas = lojasDoItem.map(l => supabase.from('pedidos').update({ qtd_bonificada: 0 }).eq('id', l.id_pedido));
         await Promise.all(promessasBasicas);
     } else {
         for (let loja of lojasComBonificacao) {
             const cobrada = Number(loja.qtd_pedida) || 0;
             const bonificada = Number(loja.qtd_bonificada_cliente) || 0;
             const totalBruto = cobrada + bonificada;

             const msg = `A loja ${loja.nome_fantasia} pediu para o item ${nomeItem}:\n- ${cobrada} pagas\n- ${bonificada} bonificadas\n\nTotal: ${totalBruto} itens.\n\nAo recusar a bonificação, qual será o novo total desta loja?\n\n[OK] = Enviar ${totalBruto} itens (COBRANDO TUDO)\n[CANCELAR] = Enviar apenas ${cobrada} itens`;

             const querTotalBruto = window.confirm(msg);
             const novaQtd = querTotalBruto ? totalBruto : cobrada;

             promessas.push(supabase.from('pedidos').update({ qtd_bonificada: 0, quantidade: novaQtd }).eq('id', loja.id_pedido));
         }
     }

     await Promise.all(promessas);
     mostrarNotificacao(`❌ Bonificação de ${nomeItem} tratada.`, 'info');
     carregarDados(true);
     setCarregando(false);
  };

  // Desfaz lançamentos de um fornecedor e volta os pedidos para pendentes.

  const desfazerFeitoPorFornecedor = async (pedidosParaCancelar, nomeForn, e) => {
     e.stopPropagation();
     if (!window.confirm(`Deseja cancelar as compras deste item no fornecedor ${nomeForn}?\nEles voltarão para a lista de PENDENTES.`)) return;
     setCarregando(true);
     const promessas = pedidosParaCancelar.map(p => supabase.from('pedidos').update({ fornecedor_compra: '', custo_unit: '', qtd_atendida: 0, qtd_bonificada: 0, status_compra: 'pendente', wpp_enviado: false, conferido: false, para2_ok: false }).eq('id', p.id));
     await Promise.all(promessas);
     carregarDados(true);
     setCarregando(false);
  };

  // Marca falta a partir da aba de feitos.

  const marcarFaltaFeitoGeral = async (item, e) => {
     e.stopPropagation();
     if (!window.confirm(`🚫 Deseja marcar TODAS as compras do item "${item.nome}" como FALTA?`)) return;
     setCarregando(true);
     const promessas = item.itens.map(p => supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA', fornecedor_compra: '', wpp_enviado: false, conferido: false, para2_ok: false }).eq('id', p.id));
     await Promise.all(promessas);
     carregarDados(true);
     setCarregando(false);
  };

  // Troca o nome do fornecedor nos pedidos já lançados do dia.

  const salvarNovoNomeFornecedor = async (nomeAntigo) => {
    if (!novoNomeForn.trim()) return;
    
    const fornecedorFinal = verificarFornecedorCadastrado(novoNomeForn);
    if (!fornecedorFinal) return;

    setCarregando(true);
    const { data: pedidosParaAtualizar } = await supabase.from('pedidos').select('id, fornecedor_compra').eq('data_pedido', dataFiltro);
    const promessas = [];
    (pedidosParaAtualizar || []).forEach(p => {
      let fName = String(p.fornecedor_compra || '').toUpperCase().replace('ALERTA|', '').trim();
      if (fName === nomeAntigo) {
        promessas.push(supabase.from('pedidos').update({ fornecedor_compra: fornecedorFinal }).eq('id', p.id));
      }
    });
    await Promise.all(promessas);
    setEditandoNomeForn(null);
    carregarDados();
  };

  // Cria pedidos manuais para as lojas informadas no modal de adicionar item.

  const salvarNovoItemManual = async () => {
      const nomeDigitado = novoItemBusca.toUpperCase().trim();
      if (!nomeDigitado) return alert("Digite ou selecione o nome do produto.");
      
      const nomeLimpo = removerAcentos(nomeDigitado);
      const prodOficial = produtosBd.find(p => removerAcentos(p.nome) === nomeLimpo);
      const nomeFinal = prodOficial ? prodOficial.nome.toUpperCase().trim() : nomeDigitado;

      const lojasComAviso = [];
      Object.keys(novoItemLojas).forEach(lojaId => {
          const qtd = parseFloat(novoItemLojas[lojaId]);
          if (qtd > 0) {
              const pedidoExistente = pedidosRaw.find(p => 
                 String(p.nome_produto).toUpperCase() === nomeFinal && 
                 String(p.loja_id) === String(lojaId)
              );
              if (pedidoExistente) {
                  const infoL = lojasBd.find(l => String(l.codigo_loja) === String(lojaId));
                  lojasComAviso.push(`${infoL ? infoL.nome_fantasia : 'Loja '+lojaId}: Pediu ${pedidoExistente.quantidade}`);
              }
          }
      });

      if (lojasComAviso.length > 0) {
          const msg = `⚠️ ESTE ITEM JÁ EXISTE NO CARRINHO DAS LOJAS ABAIXO:\n\n${lojasComAviso.join('\n')}\n\nPor favor, vá em "Listas de Lojas" ou no Painel de Edição da própria loja para editar a quantidade em vez de duplicar o pedido.`;
          return alert(msg);
      }

      const payload = [];
      const unidadeRef = prodOficial ? prodOficial.unidade_medida : 'UN';

      Object.keys(novoItemLojas).forEach(lojaId => {
          const qtd = parseFloat(novoItemLojas[lojaId]);
          if (qtd > 0) {
              payload.push({
                  data_pedido: dataFiltro,
                  loja_id: lojaId,
                  nome_produto: nomeFinal,
                  quantidade: qtd,
                  unidade_medida: unidadeRef,
                  status_compra: 'pendente', 
                  fornecedor_compra: '',
                  custo_unit: '',
                  qtd_atendida: 0, 
                  qtd_bonificada: 0,
                  apenas_cobranca: false 
              });
          }
      });

      if (payload.length === 0) return alert("Você precisa preencher a quantidade em pelo menos uma loja.");

      setCarregando(true);
      const { error } = await supabase.from('pedidos').insert(payload);
      
      if (error) {
          alert("Erro ao adicionar: " + error.message);
          setCarregando(false);
      } else {
          setModalAdicionarItem(false);
          setNovoItemBusca('');
          setNovoItemLojas({});
          mostrarNotificacao("✅ Pedido manual adicionado em Pendentes!", "sucesso");
          carregarDados();
      }
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
      setFornecedoresOficiais(fornData || []);

      const { data: lojasData } = await supabase.from('lojas').select('*').order('codigo_loja', { ascending: true });
      let lojasDb = lojasData || [];
      const temFrazao = lojasDb.some(l => extrairNum(l.codigo_loja) === 0);
      if (!temFrazao) {
        lojasDb.unshift({ id: 99999, codigo_loja: '00', nome_fantasia: 'FRAZÃO (TESTE)' });
      }
      setLojasBd(ordenarLojas(lojasDb));
      
      const { data: prodData } = await supabase.from('produtos').select('*');
      setProdutosBd(prodData || []); 
      
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro);
      setPedidosRaw(pedData || []);

      const mapaPendentes = {};
      const mapaFeitos = {};
      const mapaGeralItens = {}; 
      const mapaForn = {};

      (pedData || []).forEach(p => {
        if (p.bloqueado === true) return; 

        const idLoja = extrairNum(p.loja_id);
        const nomeProdutoUpper = String(p.nome_produto || "DESCONHECIDO").toUpperCase();
        const qtdPedida = Number(p.quantidade || 0);
        const qtdBonificada = Number(p.qtd_bonificada || 0);

        if (idLoja !== null && idLoja >= 0) { 
          const lojaInfo = lojasDb.find(l => extrairNum(l.codigo_loja) === idLoja);
          const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia : `Loja ${idLoja}`;

          let isAlertaFornecedor = false;
          let nomeFornOriginal = String(p.fornecedor_compra || '').toUpperCase();
          
          if (nomeFornOriginal.startsWith('ALERTA|')) {
             isAlertaFornecedor = true;
             nomeFornOriginal = nomeFornOriginal.replace('ALERTA|', '');
          }

          if (p.status_compra === 'pendente') {
            if (!mapaPendentes[nomeProdutoUpper]) {
              mapaPendentes[nomeProdutoUpper] = { nome: nomeProdutoUpper, demanda: 0, qtd_bonificada_cliente: 0, unidade: formatarUnidade(p.unidade_medida), lojas: [] };
            }
            mapaPendentes[nomeProdutoUpper].demanda += qtdPedida;
            mapaPendentes[nomeProdutoUpper].qtd_bonificada_cliente += qtdBonificada;
            mapaPendentes[nomeProdutoUpper].lojas.push({ 
              id_pedido: p.id, loja_id: idLoja, nome_fantasia: nomeLoja, qtd_pedida: qtdPedida, qtd_bonificada_cliente: qtdBonificada 
            });
            
            if (isAlertaFornecedor && nomeFornOriginal && nomeFornOriginal !== 'REFAZER') {
               if (!mapaForn[nomeFornOriginal]) {
                   mapaForn[nomeFornOriginal] = { nome: nomeFornOriginal, chavePix: '', totalPix: 0, totalBoleto: 0, totalBruto: 0, totalDescontoBonif: 0, qtdBonificadaGeral: 0, totalGeral: 0, lojas: {}, alertas: [], resumo: {} };
               }
               if (!mapaForn[nomeFornOriginal].alertas.includes(nomeProdutoUpper)) {
                   mapaForn[nomeFornOriginal].alertas.push(nomeProdutoUpper);
               }
            }
          } else {
            if (!p.apenas_cobranca) {
              if (!mapaFeitos[nomeProdutoUpper]) mapaFeitos[nomeProdutoUpper] = { nome: nomeProdutoUpper, total_resolvido: 0, status: p.status_compra, unidade: formatarUnidade(p.unidade_medida), itens: [] };
              mapaFeitos[nomeProdutoUpper].total_resolvido += qtdPedida;
              mapaFeitos[nomeProdutoUpper].itens.push(p);
            }
          }

          if (!p.apenas_cobranca) {
              if (!mapaGeralItens[nomeProdutoUpper]) {
                 mapaGeralItens[nomeProdutoUpper] = {
                   nome: nomeProdutoUpper, unidade: formatarUnidade(p.unidade_medida), total_solicitado: 0, total_comprado: 0, isFaltaTotal: false, temBoleto: false, fornecedores_comprados: {}
                 };
              }
              mapaGeralItens[nomeProdutoUpper].total_solicitado += qtdPedida;

              if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
                 mapaGeralItens[nomeProdutoUpper].total_comprado += Number(p.qtd_atendida || 0);
                 let fNameRaw = p.fornecedor_compra ? String(p.fornecedor_compra).toUpperCase() : 'DESCONHECIDO';
                 let fName = fNameRaw.replace('ALERTA|', '').trim();
                 
                 const fornInfoParaPJ = (fornData || []).find(f => (f.nome_fantasia || '').toUpperCase() === fName);
                 let displayFornName = fName;
                 if (fornInfoParaPJ && String(fornInfoParaPJ.tipo_chave_pix || '').toUpperCase() === 'CNPJ') {
                     displayFornName = `${fName} (PJ)`;
                 }

                 if (p.status_compra === 'boleto') displayFornName += ' (B)';
                 
                 if (!mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[displayFornName]) {
                     mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[displayFornName] = { qtd: 0, isBoleto: p.status_compra === 'boleto' };
                 }
                 mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[displayFornName].qtd += Number(p.qtd_atendida || 0);
                 if (p.status_compra === 'boleto') mapaGeralItens[nomeProdutoUpper].temBoleto = true;
              }
              
              if (p.status_compra === 'falta') {
                 mapaGeralItens[nomeProdutoUpper].total_solicitado -= qtdPedida; 
              }

              if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
                 let fNomeRaw = String(p.fornecedor_compra || '').toUpperCase();
                 let fNome = fNomeRaw.replace('ALERTA|', '').trim();

                 if (fNome && fNome !== 'REFAZER') {
                     if (!mapaForn[fNome]) {
                         const fInfo = (fornData || []).find(f => (f.nome_fantasia || '').toUpperCase() === fNome);
                         mapaForn[fNome] = {
                             nome: fNome, chavePix: fInfo ? fInfo.chave_pix : '', totalPix: 0, totalBoleto: 0, totalBruto: 0, totalDescontoBonif: 0, qtdBonificadaGeral: 0, totalGeral: 0, lojas: {}, alertas: [], resumo: {}
                         };
                     }

                     const isBoleto = p.status_compra === 'boleto';
                     let baseVal = String(p.custo_unit || 'R$ 0,00');
                     let qtdBonifFornecedor = 0;
                     
                     if (baseVal.includes('BONIFICAÇÃO |')) {
                         baseVal = baseVal.split('|')[1] ? baseVal.split('|')[1].trim() : 'R$ 0,00';
                     }
                     
                     qtdBonifFornecedor = Number(p.qtd_bonificada) || 0;

                     const valNum = tratarPrecoNum(baseVal);
                     const baseValFormatado = valNum > 0 ? formatarMoeda(valNum) : baseVal; 
                     
                     const qtdCobradaForn = Math.max(0, p.qtd_atendida - qtdBonifFornecedor);
                     const totalItemFornCobrado = qtdCobradaForn * valNum;
                     const valorEconomizadoBonif = qtdBonifFornecedor * valNum;

                     const placaBase = lojaInfo && lojaInfo.placa_caminhao ? String(lojaInfo.placa_caminhao).toUpperCase().trim() : 'SEM PLACA';
                     
                     if (!mapaForn[fNome].lojas[nomeLoja]) {
                         mapaForn[fNome].lojas[nomeLoja] = { nome: nomeLoja, placa: placaBase, totalLoja: 0, itens: [], wpp_enviado: true };
                     }
                     
                     if (!p.wpp_enviado) {
                         mapaForn[fNome].lojas[nomeLoja].wpp_enviado = false;
                     }

                     const idxItemForn = mapaForn[fNome].lojas[nomeLoja].itens.findIndex(i => 
                        i.nome === nomeProdutoUpper && i.isBoleto === isBoleto && tratarPrecoNum(i.valor_unit) === valNum
                     );

                     if (idxItemForn >= 0) {
                         mapaForn[fNome].lojas[nomeLoja].itens[idxItemForn].qtd += p.qtd_atendida;
                         mapaForn[fNome].lojas[nomeLoja].itens[idxItemForn].qtd_bonificada += qtdBonifFornecedor;
                         mapaForn[fNome].lojas[nomeLoja].itens[idxItemForn].totalNum += totalItemFornCobrado;
                     } else {
                         mapaForn[fNome].lojas[nomeLoja].itens.push({
                             id_pedido: p.id, nome: nomeProdutoUpper, qtd: p.qtd_atendida, qtd_bonificada: qtdBonifFornecedor, unidade: formatarUnidade(p.unidade_medida), valor_unit: baseValFormatado, totalNum: totalItemFornCobrado, isBoleto: isBoleto
                         });
                     }

                     if (!mapaForn[fNome].resumo[nomeProdutoUpper]) {
                         mapaForn[fNome].resumo[nomeProdutoUpper] = { qtd: 0, und: formatarUnidade(p.unidade_medida) };
                     }
                     mapaForn[fNome].resumo[nomeProdutoUpper].qtd += p.qtd_atendida;

                     mapaForn[fNome].lojas[nomeLoja].totalLoja += totalItemFornCobrado;
                     mapaForn[fNome].totalBruto += (totalItemFornCobrado + valorEconomizadoBonif);
                     mapaForn[fNome].totalDescontoBonif += valorEconomizadoBonif;
                     mapaForn[fNome].qtdBonificadaGeral += qtdBonifFornecedor;
                     mapaForn[fNome].totalGeral += totalItemFornCobrado;

                     if (isBoleto) {
                         mapaForn[fNome].totalBoleto += totalItemFornCobrado;
                     } else {
                         mapaForn[fNome].totalPix += totalItemFornCobrado;
                     }
                 }
              }
          }
        }
      });

      Object.values(mapaGeralItens).forEach(item => {
         if (item.total_solicitado <= 0 && item.total_comprado <= 0) {
             item.isFaltaTotal = true;
         }
      });
      setListaGeralItens(Object.values(mapaGeralItens).sort((a, b) => a.nome.localeCompare(b.nome)));

      const arrayPendentes = Object.values(mapaPendentes).map(item => {
        const prodRef = (prodData || []).find(p => String(p.nome || '').toUpperCase() === item.nome);
        const isResto = !!mapaFeitos[item.nome];
        return { 
          ...item, 
          preco_sugerido: prodRef ? prodRef.preco : 'R$ 0,00',
          fornecedor_sugerido: prodRef && prodRef.fornecedor_nome ? prodRef.fornecedor_nome : 'Não cadastrado',
          isResto
        };
      }).sort((a, b) => a.nome.localeCompare(b.nome));

      setDemandas(arrayPendentes);
      setPedidosFeitos(Object.values(mapaFeitos).sort((a, b) => a.nome.localeCompare(b.nome)));
      
      const fornProcessados = Object.values(mapaForn).map(f => {
         f.precisaRefazer = f.alertas && f.alertas.length > 0;
         return f;
      }).sort((a, b) => a.nome.localeCompare(b.nome));

      // Lê os estados de envio diretamente da tabela pedidos, para compartilhar os dados entre usuários.
      // A foto enviada é reconstruída com forn_enviado e qtd_enviada, inclusive quando o pedido foi desfeito.
      const mapaEnvios = {};
      const getReg = (nome) => {
        if (!mapaEnvios[nome]) {
          mapaEnvios[nome] = { completo: false, conferido: false, para2Ok: false, lojas: {}, _n: 0, _c: 0, _p: 0 };
        }
        return mapaEnvios[nome];
      };

      (pedData || []).forEach(p => {
        const idL = extrairNum(p.loja_id);
        const lojaInfoE = idL !== null && idL >= 0
          ? lojasDb.find(l => extrairNum(l.codigo_loja) === idL)
          : null;
        const nomeLojaE = lojaInfoE ? lojaInfoE.nome_fantasia : `Loja ${idL}`;
        const prodE = String(p.nome_produto || '').toUpperCase();
        const fAtual = String(p.fornecedor_compra || '').toUpperCase().replace('ALERTA|', '').trim();
        const fEnv = String(p.forn_enviado || '').toUpperCase().replace('ALERTA|', '').trim();
        const fCompleto = fEnv || fAtual;

        // A conclusão do envio também pode estar em pedidos que já foram desfeitos.
        if (p.envio_completo && fCompleto) getReg(fCompleto).completo = true;

        // Preserva a quantidade que foi efetivamente enviada, mesmo que o pedido tenha mudado depois.
        const qEnv = Number(p.qtd_enviada) || 0;
        if (fEnv && qEnv > 0 && idL !== null && idL >= 0) {
          const r = getReg(fEnv);
          r.lojas[nomeLojaE] = r.lojas[nomeLojaE] || {};
          r.lojas[nomeLojaE][prodE] = (r.lojas[nomeLojaE][prodE] || 0) + qEnv;
        }

        if (p.bloqueado === true || p.apenas_cobranca || idL === null || idL < 0) return;
        if ((p.status_compra === 'atendido' || p.status_compra === 'boleto') && fAtual && fAtual !== 'REFAZER') {
          const r = getReg(fAtual);
          r._n++;
          if (p.conferido) r._c++;
          if (p.para2_ok) r._p++;
        }
      });

      Object.values(mapaEnvios).forEach(r => {
        r.conferido = r._n > 0 && r._c === r._n;
        r.para2Ok = r._n > 0 && r._p === r._n;
        delete r._n;
        delete r._c;
        delete r._p;
      });

      setEnviosForn(mapaEnvios);
      setDataCarregada(dataFiltro);
      setFornecedoresBd(fornProcessados);

    } catch (err) { console.error("Erro VIRTUS:", err); } 
    finally { if (!silencioso) setCarregando(false); }
  }, [dataFiltro]);

  useEffect(() => { 
    carregarDados(); 
    const intervalo = setInterval(() => {
      carregarDados(true);
    }, 5000);
    return () => clearInterval(intervalo);
  }, [carregarDados]);

  // Recarrega dados do Supabase sem trocar a aba atual.

  const atualizarAoVivo = () => {
    carregarDados(true); 
    mostrarNotificacao('🔄 Lista atualizada com os dados mais recentes!', 'sucesso');
  };

  // Zera compras, boletos e faltas do dia e devolve tudo para pendentes.

// Nome da loja de um pedido (mesma regra usada na tela).
// Nome da loja de um pedido (mesma regra usada na tela).
const nomeLojaDoPedido = (p) => {
  const idL = extrairNum(p.loja_id);
  const l = lojasBd.find(x => extrairNum(x.codigo_loja) === idL);
  return l ? l.nome_fantasia : `Loja ${idL}`;
};

// Pedidos ativos (comprados) de um fornecedor.
const pedidosAtivosForn = (nomeForn) => pedidosRaw.filter(p =>
  (p.status_compra === 'atendido' || p.status_compra === 'boleto') &&
  !p.apenas_cobranca && p.bloqueado !== true &&
  String(p.fornecedor_compra || '').toUpperCase().replace('ALERTA|', '').trim() === nomeForn
);

// Grava flags (conferido, para2_ok) em todos os pedidos do fornecedor, como o wpp_enviado.
const salvarFlagsForn = async (nomeForn, campos, regLocal) => {
  setEnviosForn(prev => ({ ...prev, [nomeForn]: { ...(prev[nomeForn] || {}), ...regLocal } }));
  const ids = pedidosAtivosForn(nomeForn).map(p => p.id);
  if (ids.length === 0) return;
  const { error } = await supabase.from('pedidos').update(campos).in('id', ids);
  if (error) {
    console.error('Erro ao salvar:', error);
    mostrarNotificacao('❌ Não foi possível salvar. Verifique o SQL das colunas novas.', 'alerta');
  }
  carregarDados(true);
};

  const resetarPedidosDoDia = async () => {
    if (!window.confirm(`🚨 ATENÇÃO: Isso vai ZERAR todos os pedidos, boletos e faltas da data ${dataBr}.\n\nTudo voltará para a aba de PENDENTES.\n\nDeseja realmente recomeçar?`)) return;
    setCarregando(true);
    try {
      await supabase.from('pedidos').update({ status_compra: 'pendente', fornecedor_compra: '', custo_unit: '', qtd_atendida: 0, qtd_bonificada: 0, wpp_enviado: false, conferido: false, para2_ok: false, envio_completo: false, qtd_enviada: 0, forn_enviado: '' }).eq('data_pedido', dataFiltro);
      setAgrupamentos([]);
      setEnviosForn({});
      setAbaAtiva('pendentes');
      carregarDados();
    } catch (err) { alert("Erro ao resetar: " + err.message); setCarregando(false); }
  };

  // Marca falta de um item inteiro direto na aba de pendentes.

  const marcarFaltaDireto = async (item, e) => {
    e.stopPropagation(); 
    setCarregando(true);
    const promessas = item.lojas.map(l => supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', l.id_pedido));
    await Promise.all(promessas);
    carregarDados();
  };

  // Abre o modal de compra e preenche fornecedor/preço sugeridos.

  const abrirModalCompra = (item) => {
    setItemModal(item);
    setAbaModal('completo');
    
    const fSugerido = (item.fornecedor_sugerido && item.fornecedor_sugerido !== 'Não cadastrado') ? item.fornecedor_sugerido : '';
    const pSugerido = item.preco_sugerido ? item.preco_sugerido.replace('R$ ', '') : '';
    
    setDadosCompra({ fornecedor: fSugerido, valor_unit: pSugerido, qtd_pedir: item.demanda, isFaltaGeral: false, qtdFornecedor: '', temBonificacao: false, isCredito: false });
    
    setLojasEnvolvidas(ordenarLojas(item.lojas).map(l => ({ ...l, qtd_receber: l.qtd_pedida, qtd_bonificada: 0, isFalta: false, isBoleto: false })));
  };

  // Atualiza campos de uma loja no modal, como receber, falta, boleto ou bonificação.

  const atualizarLoja = (id_pedido, campo, valor) => {
    setLojasEnvolvidas(lojasEnvolvidas.map(l => {
      if (l.id_pedido === id_pedido) {
        const novaLoja = { ...l, [campo]: valor };
        if (campo === 'isFalta' && valor === true) novaLoja.qtd_receber = 0;
        if (campo === 'qtd_bonificada') {
           const maximo = Number(novaLoja.qtd_receber) || Number(novaLoja.qtd_pedida);
           if (Number(valor) > maximo) {
               alert(`Você não pode bonificar (${valor}) mais do que a loja está recebendo (${maximo}).`);
               novaLoja.qtd_bonificada = maximo;
           }
        }
        return novaLoja;
      }
      return l;
    }));
  };

  // Altera a quantidade original de uma loja e registra quem modificou.

  const atualizarPedidoTotalLoja = async (idPedido, novaQuantidade, nomeLoja) => {
      const qtdNum = Number(novaQuantidade);
      if (isNaN(qtdNum) || qtdNum < 0) return alert('Quantidade inválida.');
      if (!window.confirm(`Deseja alterar o pedido original da loja ${nomeLoja} para ${qtdNum}?`)) return;

      const original = pedidosRaw.find(p => p.id === idPedido);
      if (!original) return;

      const oldQty = Number(original.quantidade);
      const newQty = qtdNum;
      let modType = '';
      let modQty = 0;

      if (newQty === 0) {
          modType = 'REMOVEU';
          modQty = oldQty;
      } else if (newQty > oldQty) {
          modType = 'ADICIONOU';
          modQty = newQty - oldQty;
      } else if (newQty < oldQty) {
          modType = 'REDUZIU';
          modQty = oldQty - newQty;
      } else {
          return; // Sem alteração
      }

      const lojaData = lojasEnvolvidas.find(l => l.id_pedido === idPedido);
      const bonifAdd = lojaData ? Number(lojaData.qtd_bonificada) : 0;

      setCarregando(true);
      
      const { error } = await supabase.from('pedidos').update({ 
          quantidade: newQty,
          modificacao: usuario?.nome || 'Admin',
          modificacao_tipe: modType,
          quantidade_modificada: modQty,
          bonific_add: bonifAdd
      }).eq('id', idPedido);

      if (error) {
          alert('Erro ao atualizar: ' + error.message);
      } else {
          setLojasEnvolvidas(prev => prev.map(l => l.id_pedido === idPedido ? { ...l, qtd_pedida: newQty } : l));
          mostrarNotificacao(`✅ Pedido da loja ${nomeLoja} atualizado para ${newQty}!`, 'sucesso');
          carregarDados(true);
      }
      setCarregando(false);
  };

  // Exclui definitivamente o pedido daquela loja para o item aberto.

  const excluirPedidoLojaModal = async (idPedido, nomeLoja) => {
      if (!window.confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE o pedido deste item para a loja ${nomeLoja}?`)) return;
      setCarregando(true);
      
      await supabase.from('pedidos').delete().eq('id', idPedido);
      
      setLojasEnvolvidas(prev => prev.filter(l => l.id_pedido !== idPedido));
      
      mostrarNotificacao(`✅ Item excluído da lista da loja ${nomeLoja}.`, 'sucesso');
      carregarDados(true);
      setCarregando(false);
  };

  // Copia para o fechamento a bonificação que veio do pedido da loja.

  const aceitarBonificacaoCliente = () => {
     setDadosCompra({...dadosCompra, temBonificacao: true});
     setLojasEnvolvidas(lojasEnvolvidas.map(l => ({
        ...l,
        qtd_bonificada: l.qtd_bonificada_cliente || 0
     })));
     mostrarNotificacao('✅ Bonificações preenchidas conforme pedido das lojas.', 'sucesso');
  };

  // Finaliza pedido unitário/completo; aqui o botão CRÉDITO grava custo negativo na nota.

  const finalizarPedidoCompleto = () => {
    if (!dadosCompra.isFaltaGeral && !dadosCompra.fornecedor) return alert("⚠️ Preencha o fornecedor.");

    let fornecedorFinal = '';
    if (!dadosCompra.isFaltaGeral) {
        fornecedorFinal = verificarFornecedorCadastrado(dadosCompra.fornecedor);
        if (!fornecedorFinal) return; 
    }

    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    // Mantém o preço normal quando o pedido não for crédito.
    const precoFinalBase = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';
    // Se CRÉDITO estiver marcado, grava o custo como negativo para descontar da nota.
    const precoFinal = dadosCompra.isCredito ? `R$ -${precoLimpo.replace('-', '')}` : precoFinalBase;
    const qtdDesejada = Number(dadosCompra.qtd_pedir) || 0;

    setItemModal(null);
    setCarregando(true);

    const promessas = [];
    const pedidosParaClonar = [];
    let qtdRestanteParaDistribuir = qtdDesejada;

    if (dadosCompra.isFaltaGeral) {
      lojasEnvolvidas.forEach(l => promessas.push(supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', l.id_pedido)));
    } else {
      lojasEnvolvidas.forEach(loja => {
        const bonificada = Number(loja.qtd_bonificada) || 0;
        
        // Define como o pedido será registrado: boleto ou atendido normal.
        const statusGeralLoja = loja.isBoleto ? 'boleto' : 'atendido';
        // Em boleto o custo fica marcado como BOLETO; fora boleto usa preço normal ou crédito negativo.
        const custoFinalItem = loja.isBoleto ? 'BOLETO' : precoFinal;

        if (qtdRestanteParaDistribuir >= loja.qtd_pedida) {
          promessas.push(supabase.from('pedidos').update({
            fornecedor_compra: fornecedorFinal, custo_unit: custoFinalItem, qtd_atendida: loja.qtd_pedida, qtd_bonificada: bonificada, status_compra: statusGeralLoja
          }).eq('id', loja.id_pedido));
          qtdRestanteParaDistribuir -= loja.qtd_pedida;
        } else if (qtdRestanteParaDistribuir > 0) {
          promessas.push(supabase.from('pedidos').update({
            fornecedor_compra: fornecedorFinal, custo_unit: custoFinalItem, qtd_atendida: qtdRestanteParaDistribuir, qtd_bonificada: bonificada, quantidade: qtdRestanteParaDistribuir, status_compra: statusGeralLoja
          }).eq('id', loja.id_pedido));

          const resto = loja.qtd_pedida - qtdRestanteParaDistribuir;
          const rowOriginal = pedidosRaw.find(p => p.id === loja.id_pedido);
          if (rowOriginal) {
            const { id, created_at, ...dadosLimpos } = rowOriginal;
            pedidosParaClonar.push({ ...dadosLimpos, quantidade: resto, qtd_atendida: 0, status_compra: 'pendente', fornecedor_compra: '', custo_unit: '', qtd_bonificada: 0, wpp_enviado: false, conferido: false, para2_ok: false, envio_completo: false, qtd_enviada: 0, forn_enviado: '' });
          }
          qtdRestanteParaDistribuir = 0;
        } 
      });
    }

    Promise.all(promessas).then(async () => {
      if (pedidosParaClonar.length > 0) await supabase.from('pedidos').insert(pedidosParaClonar);
      mostrarNotificacao("✅ Pedido fechado com sucesso!", "sucesso");
      carregarDados(true);
      setCarregando(false);
    });
  };

  // Finaliza quantidades diferentes por loja no mesmo item.

  const finalizarPedidoFracionado = () => {
    const temCompra = lojasEnvolvidas.some(l => (Number(l.qtd_receber) > 0));
    if (temCompra && !dadosCompra.fornecedor) return alert("⚠️ O fornecedor é obrigatório.");

    let fornecedorFinal = '';
    if (temCompra) {
        fornecedorFinal = verificarFornecedorCadastrado(dadosCompra.fornecedor);
        if (!fornecedorFinal) return; 
    }

    let precoLimpo = dadosCompra.valor_unit.replace(/[^\d,.-]/g, '').trim();
    if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
    const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';

    setItemModal(null);
    setCarregando(true);

    const promessas = [];
    const pedidosParaClonar = [];

    lojasEnvolvidas.forEach(loja => {
      const receber = Number(loja.qtd_receber) || 0;
      const bonificada = Number(loja.qtd_bonificada) || 0;
      
      if (receber > 0) {
        const custoFinalItem = loja.isBoleto ? 'BOLETO' : precoFinal;
        
        promessas.push(supabase.from('pedidos').update({
          fornecedor_compra: fornecedorFinal, custo_unit: custoFinalItem, qtd_atendida: receber, qtd_bonificada: bonificada, quantidade: receber, status_compra: loja.isBoleto ? 'boleto' : 'atendido'
        }).eq('id', loja.id_pedido));

        if (receber < loja.qtd_pedida) {
          const resto = loja.qtd_pedida - receber;
          const rowOriginal = pedidosRaw.find(p => p.id === loja.id_pedido);
          if (rowOriginal) {
            const { id, created_at, ...dadosLimpos } = rowOriginal;
            pedidosParaClonar.push({ ...dadosLimpos, quantidade: resto, qtd_atendida: 0, status_compra: loja.isFalta ? 'falta' : 'pendente', custo_unit: loja.isFalta ? 'FALTA' : '', fornecedor_compra: '', qtd_bonificada: 0, wpp_enviado: false, conferido: false, para2_ok: false, envio_completo: false, qtd_enviada: 0, forn_enviado: '' });
          }
        }
      } else if (loja.isFalta) {
        promessas.push(supabase.from('pedidos').update({ status_compra: 'falta', qtd_atendida: 0, custo_unit: 'FALTA' }).eq('id', loja.id_pedido));
      }
    });

    Promise.all(promessas).then(async () => {
      if (pedidosParaClonar.length > 0) await supabase.from('pedidos').insert(pedidosParaClonar);
      mostrarNotificacao("✅ Pedido fracionado salvo!", "sucesso");
      carregarDados(true);
      setCarregando(false);
    });
  };

  // Remove alerta de fornecedor pendente depois de corrigido.

  const limparAlertaFornecedor = async (nomeForn) => {
     setCarregando(true);
     await supabase.from('pedidos').update({ fornecedor_compra: '' }).eq('data_pedido', dataFiltro).eq('status_compra', 'pendente').like('fornecedor_compra', `ALERTA|${nomeForn}`);
     carregarDados();
  };

  // Escolhe o nome do produto que será enviado no WhatsApp.

  const getNomeExibicaoWhatsApp = (fornecedorNome, itemName, itemUnidade) => {
     if (nomesPersonalizados[fornecedorNome] && nomesPersonalizados[fornecedorNome][itemName]) {
         const obj = nomesPersonalizados[fornecedorNome][itemName];
         return obj.usarUnidade ? `${obj.nome} - ${String(itemUnidade).toUpperCase()}` : obj.nome;
     }
     return limparNomeParaWhatsapp(formatarNomeItem(itemName));
  };

  // Monta e copia o pedido geral do fornecedor para WhatsApp, incluindo totais.


  // "ENVIAR TOTAL?" marcado: formato *TOTAL*, com valores ou, se "SEM TOTAL" marcado, só quantidades.
  const gerarPedidoGeral = async (f) => {
    if (!localCompra) return alert("⚠️ Selecione CEASA ou CEILÂNDIA no topo da tela antes de copiar os pedidos!");

    const enviarTotal = !!enviarTotalPorForn[f.nome];
    const semTotal = enviarTotal && !!semTotalPorForn[f.nome];

    let nomeLoja = '';
    let placaBase = '';
    let comp = '';

    if (!enviarTotal) {
      nomeLoja = lojaGeralSelecionada[f.nome];
      if (!nomeLoja) return alert("⚠️ Selecione a loja titular da banca para o cabeçalho (O NOME DELA IRÁ NO TOPO).");
      const lojaData = f.lojas[nomeLoja];
      placaBase = lojaData.placa.split('|')[0].trim() || 'SEM PLACA';
      comp = localCompra === 'ceasa' ? 'FRETE' : '2 NOVO';
    }

    const mapaItensGerais = {};
    Object.values(f.lojas).forEach(loja => {
      loja.itens.forEach(item => {
        const key = `${item.nome}`;
        if (!mapaItensGerais[key]) {
          mapaItensGerais[key] = { ...item, qtd: 0, qtd_bonificada: 0 };
        }
        mapaItensGerais[key].qtd += item.qtd;
        mapaItensGerais[key].qtd_bonificada += item.qtd_bonificada || 0;
      });
    });

    // Monta o nome exibido de cada item e ordena em ordem alfabética por esse nome.
    const itensOrdenados = Object.values(mapaItensGerais).map(i => {
      const prodDB = produtosBd.find(p => p.nome.toUpperCase() === i.nome);
      let exibicaoUnidade = i.unidade;
      if (prodDB && prodDB.unidade_medida === 'KG' && prodDB.peso_caixa) {
        exibicaoUnidade = `${prodDB.peso_caixa}Kg`;
      }
      return { ...i, nomeWhats: getNomeExibicaoWhatsApp(f.nome, i.nome, exibicaoUnidade) };
    }).sort((a, b) => a.nomeWhats.localeCompare(b.nomeWhats, 'pt-BR'));

    let msg = enviarTotal
      ? `*TOTAL*\n\n`
      : `*${nomeLoja.replace(/^\d+\s*-\s*/, '').trim().toUpperCase()}*\n\n`;

    itensOrdenados.forEach(i => {
      if (semTotal) {
        msg += `${i.qtd} ${i.nomeWhats}`;
      } else {
        const precoNum = tratarPrecoNum(i.valor_unit);
        const totalLinhaBruto = i.qtd * precoNum;
        msg += `${i.qtd} ${i.nomeWhats} - ${i.valor_unit} (Total: ${formatarMoeda(totalLinhaBruto)})`;
      }
      if (i.qtd_bonificada > 0) msg += ` (${i.qtd_bonificada} BONIFICAÇÕES)`;
      msg += `\n`;
    });

    if (enviarTotal) {
      const qtdLojas = Object.keys(f.lojas).length;
      msg += `\nQtd Lojas: ${qtdLojas}`;
      if (!semTotal) msg += `\nTOTAL: ${formatarMoeda(f.totalGeral)}`;
    } else {
      msg += `\n${placaBase} ${comp ? '- ' + comp : ''} - TOTAL: ${formatarMoeda(f.totalGeral)}`;
    }

    navigator.clipboard.writeText(msg);

    await registrarEnvio(f, true);

    carregarDados(true);
    mostrarNotificacao('✅ Pedido Geral copiado para o WhatsApp e marcado como ENVIADO!', 'sucesso');
  };

  // Copia a lista de uma loja específica para WhatsApp e marca como enviada.

  const copiarMensagemWhatsapp = async (lojaNome, lojaData, fNome, f) => {
    if (!localCompra) return alert("⚠️ Selecione CEASA ou CEILÂNDIA no topo da tela antes de copiar os pedidos!");

    const nomeFormatado = lojaNome.replace(/^\d+\s*-\s*/, '').trim().toUpperCase();
    const placaBase = lojaData.placa.split('|')[0].trim() || 'SEM PLACA';
    const comp = localCompra ? (localCompra === 'ceasa' ? 'FRETE' : '2 NOVO') : '';

    let msg = `*${nomeFormatado}*\n\n`;
    lojaData.itens.forEach(i => { 
        const prodDB = produtosBd.find(p => p.nome.toUpperCase() === i.nome);
        let exibicaoUnidade = i.unidade;
        if (prodDB && prodDB.unidade_medida === 'KG' && prodDB.peso_caixa) {
           exibicaoUnidade = `${prodDB.peso_caixa}Kg`;
        }

        const nomeWhats = getNomeExibicaoWhatsApp(fNome, i.nome, exibicaoUnidade);
        msg += `${i.qtd} ${nomeWhats}`;
        
        if (i.qtd_bonificada > 0) msg += ` (${i.qtd_bonificada} BONIFICAÇÕES)`;
        msg += `\n`;
    });
    msg += `\n${placaBase} ${comp ? '- ' + comp : ''}`;
    
    navigator.clipboard.writeText(msg);

    await registrarEnvio(f, false, [lojaNome]);

    carregarDados(true);
    mostrarNotificacao('✅ Lista da loja copiada e marcada como ENVIADA!', 'sucesso');
  };

  // Finaliza um grupo de itens por fornecedor, lançando preços e boleto quando escolhido.

  const finalizarLoteFornecedor = (grupoId, tipoFechamento) => {
    const grupo = agrupamentos.find(g => g.id === grupoId);
    if (!grupo) return;

    setCarregando(true);
    const promessas = [];
    
    let isBoleto = tipoFechamento === 'boleto';
    let tudoPreenchido = true;

    grupo.itens.forEach(nomeItem => {
        const demandaItem = demandas.find(d => d.nome === nomeItem);
        
        let precoDigitado = precosAgrupados[`${grupoId}_${nomeItem}`];
        if (precoDigitado === undefined && demandaItem && demandaItem.preco_sugerido) {
            precoDigitado = demandaItem.preco_sugerido.replace('R$ ', '');
        }

        if (!precoDigitado || precoDigitado === '0' || precoDigitado === '0,00') tudoPreenchido = false;

        let precoLimpo = precoDigitado ? precoDigitado.replace(/[^\d,.-]/g, '').trim() : '';
        if (!precoLimpo.includes(',') && precoLimpo) precoLimpo += ',00';
        const precoFinal = precoLimpo ? `R$ ${precoLimpo}` : 'R$ 0,00';
        
        const custoFinal = isBoleto ? 'BOLETO' : precoFinal;

        if (demandaItem) {
           demandaItem.lojas.forEach(loja => {
               if (!grupo.lojasRestritas || grupo.lojasRestritas.includes(loja.loja_id)) {
                   promessas.push(supabase.from('pedidos').update({
                       fornecedor_compra: grupo.fornecedor,
                       custo_unit: custoFinal,
                       qtd_atendida: loja.qtd_pedida, 
                       qtd_bonificada: loja.qtd_bonificada_cliente || 0,
                       status_compra: isBoleto ? 'boleto' : 'atendido'
                   }).eq('id', loja.id_pedido));
               }
           });
        }
    });
    
    if (!isBoleto && !tudoPreenchido && !window.confirm("Alguns itens estão sem preço. Deseja finalizar mesmo assim?")) {
       setCarregando(false);
       return;
    }

    Promise.all(promessas).then(() => {
        setAgrupamentos(prev => prev.filter(g => g.id !== grupoId));
        mostrarNotificacao(`✅ Preços de ${grupo.fornecedor} lançados!`, 'sucesso');
        carregarDados(true);
        setCarregando(false);
    });
  };

  // Gera, baixa, visualiza ou compartilha o PDF do resumo de compras.

  const processarPDFResumo = async (modo = 'baixar') => {
     const elemento = document.getElementById('area-impressao-resumo');
     if (!elemento) return;
     const nomeArquivo = `Resumo_Compras_${dataBr.replace(/\//g, '-')}.pdf`;
     const opt = { margin: [10, 10, 15, 10], filename: nomeArquivo, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };

     if (!window.html2pdf) return alert("Aguarde, carregando biblioteca PDF...");
     if (modo === 'whatsapp') {
       try {
         const pdfBlob = await window.html2pdf().set(opt).from(elemento).output('blob');
         const file = new File([pdfBlob], nomeArquivo, { type: 'application/pdf' });
         if (navigator.canShare && navigator.canShare({ files: [file] })) {
           await navigator.share({ files: [file], title: nomeArquivo, text: 'Resumo de Compras' });
         } else {
           alert("Seu dispositivo não suporta compartilhamento direto. O arquivo será baixado.");
           window.html2pdf().set(opt).from(elemento).save();
         }
       } catch (e) { console.error("Erro na API de compartilhamento", e); }
     } else if (modo === 'preview') {
       const pdfBlobUrl = await window.html2pdf().set(opt).from(elemento).output('bloburl');
       window.open(pdfBlobUrl, '_blank');
     } else { window.html2pdf().set(opt).from(elemento).save(); }
  };

  // Renderiza a lista de lojas dentro do modal de compra/fracionamento.

  const renderListaLojasModal = () => (
    <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
      <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#111', display: 'block', marginBottom: '15px', textTransform: 'uppercase' }}>
        Distribuição nas lojas ({(abaModal === 'completo' ? 'Pedido Completo' : 'Pedido Fracionado')}):
      </span>
      {lojasEnvolvidas.map(loja => (
        <div key={loja.id_pedido} style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ flex: '1 1 auto', minWidth: '100px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block' }}>{loja.nome_fantasia}</span>
            <span style={{ fontSize: '10px', color: '#f97316', fontWeight: 'bold' }}>Pediu: {loja.qtd_pedida}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            {abaModal === 'fracionado' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <label style={{ fontSize: '9px', color: '#666', fontWeight: 'bold', marginBottom: '3px' }}>Receber</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" value={loja.qtd_receber} onChange={(e) => atualizarLoja(loja.id_pedido, 'qtd_receber', e.target.value)} style={{ width: '45px', padding: '6px', borderRadius: '6px', border: '2px solid #ccc', textAlign: 'center', fontWeight: 'bold' }} />
                    <button
                        onClick={() => atualizarPedidoTotalLoja(loja.id_pedido, loja.qtd_receber, loja.nome_fantasia)}
                        title="Usar este valor como o novo pedido total da loja"
                        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 6px', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold', lineHeight: '1.2' }}
                    >
                        USAR COMO<br/>TOTAL
                    </button>
                    <button
                        onClick={() => excluirPedidoLojaModal(loja.id_pedido, loja.nome_fantasia)}
                        title="Excluir este item da lista desta loja"
                        style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 6px', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold', lineHeight: '1.2' }}
                    >
                        EXCLUIR DA<br/>LISTA
                    </button>
                </div>
              </div>
            )}
            {dadosCompra.temBonificacao && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#dcfce7', padding: '5px', borderRadius: '8px', border: '1px solid #86efac' }}>
                <label style={{ fontSize: '9px', color: '#166534', fontWeight: 'bold' }}>🎁 Bonif.</label>
                <input type="number" value={loja.qtd_bonificada} onChange={(e) => atualizarLoja(loja.id_pedido, 'qtd_bonificada', e.target.value)} placeholder="0" style={{ width: '50px', padding: '6px', borderRadius: '6px', border: '1px solid #16a34a', textAlign: 'center', fontWeight: 'bold', color: '#16a34a' }} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '10px', fontWeight: '900', color: '#d97706', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <input type="checkbox" checked={loja.isBoleto} onChange={(e) => atualizarLoja(loja.id_pedido, 'isBoleto', e.target.checked)} /> BOLETO
              </label>
              <label style={{ fontSize: '10px', fontWeight: '900', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                <input type="checkbox" checked={loja.isFalta} onChange={(e) => atualizarLoja(loja.id_pedido, 'isFalta', e.target.checked)} /> FALTA
              </label>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Marca ou desmarca item para formar grupo por fornecedor.

  const alternarSelecaoLote = (nomeItem) => {
      setItensSelecionados(prev => {
          const isSelected = prev.includes(nomeItem);
          const newSelection = isSelected ? prev.filter(i => i !== nomeItem) : [...prev, nomeItem];
          
          if (!isSelected && newSelection.length === 1) {
              const itemData = demandas.find(d => d.nome === nomeItem);
              if (itemData && itemData.fornecedor_sugerido && itemData.fornecedor_sugerido !== 'Não cadastrado') {
                  setNomeFornecedorLote(itemData.fornecedor_sugerido);
              }
          } else if (newSelection.length === 0) {
              setNomeFornecedorLote('');
          }
          return newSelection;
      });
  };

  // Cria grupo simples de itens para um fornecedor.

  const criarGrupoFornecedor = () => {
    if (!nomeFornecedorLote.trim()) return alert("Digite o nome do fornecedor para agrupar.");
    if (itensSelecionados.length === 0) return alert("Selecione pelo menos um item.");
    
    const fornecedorFinal = verificarFornecedorCadastrado(nomeFornecedorLote);
    if (!fornecedorFinal) return;

    const novoGrupo = {
      id: Date.now(),
      fornecedor: fornecedorFinal,
      itens: itensSelecionados,
      status: 'pendente'
    };
    
    setAgrupamentos(prev => [...prev, novoGrupo]);
    setItensSelecionados([]);
    setNomeFornecedorLote('');
    mostrarNotificacao(`Itens separados para ${novoGrupo.fornecedor}`, 'sucesso');
    setAbaAtiva('pedidos_fornecedor');
    setGrupoExpandido(novoGrupo.id);
  };

  // Remove um grupo ainda não finalizado.

  const removerGrupoFornecedor = (idGrupo) => {
    if(window.confirm("Deseja desfazer este grupo? Os itens voltarão a ficar disponíveis para seleção.")) {
       setAgrupamentos(prev => prev.filter(g => g.id !== idGrupo));
    }
  };

  // Abre o fracionamento por loja e prepara as lojas disponíveis.

  const abrirModalFracionarLote = () => {
      const lojasSet = new Map();
      itensSelecionados.forEach(nomeItem => {
          const d = demandas.find(x => x.nome === nomeItem);
          if (d) {
              d.lojas.forEach(l => {
                  if (!lojasSet.has(l.loja_id)) {
                      lojasSet.set(l.loja_id, { id: l.loja_id, nome: l.nome_fantasia });
                  }
              });
          }
      });
      setFracionarLojasDisp(Array.from(lojasSet.values()));
      setFracionarLojasSelecionadas([]);
      setFracionarFornecedor('');
      setFracionarAtribuicoes({});
      setModalFracionarLoteAberto(true);
  };

  // Marca/desmarca loja dentro do fracionamento em lote.

  const toggleLojaFracionada = (lojaId) => {
      if (fracionarAtribuicoes[lojaId]) return; 
      setFracionarLojasSelecionadas(prev => 
          prev.includes(lojaId) ? prev.filter(id => id !== lojaId) : [...prev, lojaId]
      );
  };

  // Atribui o fornecedor digitado às lojas selecionadas.

  const atribuirFornecedorLojas = () => {
      if (fracionarLojasSelecionadas.length === 0) return alert("Selecione pelo menos uma loja para atribuir.");
      if (!fracionarFornecedor.trim()) return alert("Digite o nome do fornecedor.");
      
      const fornecedorFinal = verificarFornecedorCadastrado(fracionarFornecedor);
      if (!fornecedorFinal) return;

      setFracionarAtribuicoes(prev => {
          const newAtrib = { ...prev };
          fracionarLojasSelecionadas.forEach(id => newAtrib[id] = fornecedorFinal);
          return newAtrib;
      });

      setFracionarLojasSelecionadas([]);
      setFracionarFornecedor('');
  };

  // Remove a atribuição de fornecedor de uma loja no fracionamento.

  const resetarAtribuicao = (lojaId) => {
      setFracionarAtribuicoes(prev => {
          const newAtrib = { ...prev };
          delete newAtrib[lojaId];
          return newAtrib;
      });
  };

  // Cria vários grupos separados conforme fornecedor atribuído por loja.

  const finalizarAgrupamentoFracionado = () => {
      const fornecedoresAtribuidos = new Set(Object.values(fracionarAtribuicoes));
      const novosGrupos = [];

      fornecedoresAtribuidos.forEach(forn => {
          const lojasDoForn = Object.keys(fracionarAtribuicoes).filter(id => fracionarAtribuicoes[id] === forn).map(Number);
          
          novosGrupos.push({
              id: Date.now() + Math.random(),
              fornecedor: forn,
              itens: itensSelecionados,
              lojasRestritas: lojasDoForn,
              status: 'pendente'
          });
      });

      setAgrupamentos(prev => [...prev, ...novosGrupos]);
      setModalFracionarLoteAberto(false);
      setItensSelecionados([]);
      mostrarNotificacao('Itens separados por fornecedor/loja com sucesso!', 'sucesso');
      setAbaAtiva('pedidos_fornecedor');
  };

  if (carregando && demandas.length === 0 && pedidosFeitos.length === 0) {
    return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando...</div>;
  }

  let itensJaAgrupados = [];
  try {
      itensJaAgrupados = agrupamentos.reduce((acc, g) => acc.concat(Array.isArray(g.itens) ? g.itens : []), []);
  } catch (e) {
      itensJaAgrupados = [];
  }

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '180px', padding: '10px' }}>
      
      {/* Lista invisível usada pelo input de fornecedor para autocompletar nomes oficiais. */}
      <datalist id="lista-fornecedores">
        {fornecedoresOficiais.map(f => {
           const nomeA = (f.nome_fantasia || f.nome_completo || "").toUpperCase();
           const nomeS = nomeA.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
           return (
             <React.Fragment key={f.id}>
               <option value={nomeA} />
               {nomeA !== nomeS && <option value={nomeS} />}
             </React.Fragment>
           );
        })}
      </datalist>
      
      {/* Lista invisível usada pelo input de produto para autocompletar itens cadastrados. */}
      <datalist id="lista-produtos">
        {produtosBd.map(p => {
           const nomeA = (p.nome || "").toUpperCase();
           const nomeS = nomeA.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
           return (
             <React.Fragment key={p.id}>
               <option value={nomeA} />
               {nomeA !== nomeS && <option value={nomeS} />}
             </React.Fragment>
           );
        })}
      </datalist>

      {/* Área fixa das notificações temporárias no topo da tela. */}
      <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '10px', width: '90%', maxWidth: '400px' }}>
        {notificacoes.map(notif => (
          <div key={notif.id} style={{ background: notif.tipo === 'alerta' ? '#ef4444' : (notif.tipo === 'info' ? '#3b82f6' : '#22c55e'), color: '#fff', padding: '15px 20px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', fontSize: '13px' }}>
            <span>{notif.mensagem}</span>
          </div>
        ))}
      </div>

      {/* Cabeçalho principal: data, adicionar item, atualizar e zerar pedidos. */}
      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '900' }}>🛒 MESA DE COMPRAS</h2>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Data:</span>
              <input 
                type="date" 
                value={dataFiltro} 
                onChange={(e) => setDataFiltro(e.target.value)}
                style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
              />
              {dataFiltro !== obterDataLocal() && (
                <button 
                  onClick={() => setDataFiltro(obterDataLocal())} 
                  style={{ background: '#f97316', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  🗓️ VOLTAR PARA HOJE
                </button>
              )}
            </div>

          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalAdicionarItem(true)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 15px rgba(16,185,129,0.4)' }}>
                ➕ ADICIONAR ITEM
              </button>
              <button onClick={atualizarAoVivo} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 15px rgba(59,130,246,0.4)' }}>
                🔄 ATUALIZAR STATUS
              </button>
              <button onClick={resetarPedidosDoDia} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '11px', boxShadow: '0 4px 15px rgba(239,68,68,0.4)' }}>
                🚨 ZERAR TUDO
              </button>
            </div>

            <div style={{ display: 'flex', backgroundColor: '#333', borderRadius: '10px', padding: '4px' }}>
              <button onClick={() => setLocalCompra('ceasa')} style={{ border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: localCompra === 'ceasa' ? '#f97316' : 'transparent', color: localCompra === 'ceasa' ? '#fff' : '#999' }}>CEASA</button>
              <button onClick={() => setLocalCompra('ceilandia')} style={{ border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: localCompra === 'ceilandia' ? '#f97316' : 'transparent', color: localCompra === 'ceilandia' ? '#fff' : '#999' }}>CEILÂNDIA</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
        <button onClick={() => setAbaAtiva('pendentes')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'pendentes' ? '#f97316' : '#fff', color: abaAtiva === 'pendentes' ? '#fff' : '#64748b' }}>
          📋 PENDENTES ({demandas.length})
        </button>
        <button onClick={() => setAbaAtiva('selecionar_forn')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'selecionar_forn' ? '#8b5cf6' : '#fff', color: abaAtiva === 'selecionar_forn' ? '#fff' : '#64748b' }}>
          🛒 SELECIONAR FORN.
        </button>
        <button onClick={() => setAbaAtiva('pedidos_fornecedor')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'pedidos_fornecedor' ? '#14b8a6' : '#fff', color: abaAtiva === 'pedidos_fornecedor' ? '#fff' : '#64748b', position: 'relative' }}>
          📦 PEDIDOS AGRUPADOS {agrupamentos.length > 0 && <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: '#fff', borderRadius: '50%', padding: '2px 6px', fontSize: '10px' }}>{agrupamentos.length}</span>}
        </button>
        <button onClick={() => setAbaAtiva('feitos')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'feitos' ? '#3b82f6' : '#fff', color: abaAtiva === 'feitos' ? '#fff' : '#64748b' }}>
          ✅ FEITOS ({pedidosFeitos.length})
        </button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'fornecedores' ? '#111' : '#fff', color: abaAtiva === 'fornecedores' ? '#fff' : '#64748b' }}>
          📇 FORNECEDORES ({fornecedoresBd.length})
        </button>
        <button onClick={() => setAbaAtiva('lista_fornecedores')} style={{ flexShrink: 0, padding: '15px 20px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'lista_fornecedores' ? '#ec4899' : '#fff', color: abaAtiva === 'lista_fornecedores' ? '#fff' : '#64748b' }}>
          📦 RESUMO ITENS
        </button>
      </div>

      {/* Aba Pendentes: mostra itens ainda não comprados e abre o pedido unitário. */}
      {abaAtiva === 'pendentes' && (
        <>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span>🔍</span>
              <input placeholder={tipoBuscaPendentes === 'produto' ? "Procurar por produto..." : "Procurar por fornecedor..."} value={buscaPendentes} onChange={e => setBuscaPendentes(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
            </div>
            <div style={{ display: 'flex', gap: '15px', paddingLeft: '25px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input type="radio" name="tipoBuscaPendentes" checked={tipoBuscaPendentes === 'produto'} onChange={() => setTipoBuscaPendentes('produto')} /> PRODUTO
              </label>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input type="radio" name="tipoBuscaPendentes" checked={tipoBuscaPendentes === 'fornecedor'} onChange={() => setTipoBuscaPendentes('fornecedor')} /> FORNECEDOR
              </label>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {demandas.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#22c55e', backgroundColor: '#fff', borderRadius: '16px', fontWeight: 'bold' }}>🎉 Zero pendências!</div>
            ) : (
              demandas.filter(d => {
                const termo = removerAcentos(buscaPendentes);
                if (tipoBuscaPendentes === 'produto') return removerAcentos(d.nome).includes(termo);
                return removerAcentos(d.fornecedor_sugerido).includes(termo);
              }).map(item => (
                <div key={item.nome} onClick={() => abrirModalCompra(item)} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer', borderTop: item.isResto ? '4px solid #ef4444' : '4px solid #f97316', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '5px', right: '5px' }}>
                    <button onClick={(e) => marcarFaltaDireto(item, e)} style={{ background: '#fef2f2', color: '#ef4444', border: 'none', padding: '4px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>🚫</button>
                  </div>
                  <div style={{ backgroundColor: item.isResto ? '#fef2f2' : '#fef3c7', color: item.isResto ? '#ef4444' : '#b45309', padding: '10px', borderRadius: '50%', fontWeight: '900', fontSize: '20px', width: '50px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                    {item.demanda}
                  </div>
                 <strong style={{ fontSize: '13px', color: '#111', lineHeight: '1.2' }}>{item.nome}</strong>
                 <span style={{ fontSize: '12px', color: '#f97316', fontWeight: '900', marginTop: '3px' }}>{calcularPrecoFinalSugestao(item.nome)}</span>
                 {item.fornecedor_sugerido && item.fornecedor_sugerido !== 'Não cadastrado' && (
                    <span style={{ fontSize: '10px', color: '#8b5cf6', fontWeight: 'bold', marginTop: '2px' }}>🏢 {item.fornecedor_sugerido}</span>
                 )}
                  <span style={{ fontSize: '10px', color: item.isResto ? '#ef4444' : '#64748b', fontWeight: item.isResto ? 'bold' : 'normal', marginTop: '5px' }}>
                    {item.isResto ? 'RESTA COMPRAR' : `${item.lojas.length} Loja(s)`}
                  </span>
                  {item.qtd_bonificada_cliente > 0 && (
                     <span style={{ fontSize: '10px', color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: '6px', fontWeight: 'bold', marginTop: '5px' }}>
                       🎁 {item.qtd_bonificada_cliente} Bonif. Solicitada
                     </span>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Aba Selecionar: permite marcar itens e montar grupo para fornecedor. */}
      {abaAtiva === 'selecionar_forn' && (
        <div style={{ paddingBottom: '80px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span>🔍</span>
              <input placeholder={tipoBuscaSelecionar === 'produto' ? "Filtrar por produto..." : "Filtrar por fornecedor..."} value={buscaSelecionar} onChange={e => setBuscaSelecionar(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
            </div>
            <div style={{ display: 'flex', gap: '15px', paddingLeft: '25px' }}>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input type="radio" name="tipoBuscaSelecionar" checked={tipoBuscaSelecionar === 'produto'} onChange={() => setTipoBuscaSelecionar('produto')} /> PRODUTO
              </label>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input type="radio" name="tipoBuscaSelecionar" checked={tipoBuscaSelecionar === 'fornecedor'} onChange={() => setTipoBuscaSelecionar('fornecedor')} /> FORNECEDOR
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {demandas.filter(d => {
              if (itensJaAgrupados.includes(d.nome)) return false;
              const termo = removerAcentos(buscaSelecionar);
              if (tipoBuscaSelecionar === 'produto') return removerAcentos(d.nome).includes(termo);
              return removerAcentos(d.fornecedor_sugerido).includes(termo);
            }).map(item => {
              const isSelecionado = itensSelecionados.includes(item.nome);
              
              return (
              <div key={item.nome} onClick={() => alternarSelecaoLote(item.nome)} style={{ display: 'flex', alignItems: 'center', gap: '15px', background: '#fff', padding: '15px', borderRadius: '12px', borderLeft: isSelecionado ? '5px solid #8b5cf6' : '5px solid #e2e8f0', cursor: 'pointer', transition: '0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                 <input type="checkbox" checked={isSelecionado} readOnly style={{ width: '20px', height: '20px', accentColor: '#8b5cf6', pointerEvents: 'none' }} />
                 <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#111' }}>{item.nome}</strong>
                    <small style={{ color: '#666', fontSize: '11px' }}>{item.demanda} {item.unidade} • {item.lojas.length} Loja(s)</small>
                    
                    {item.fornecedor_sugerido && item.fornecedor_sugerido !== 'Não cadastrado' && (
                       <span style={{ fontSize: '10px', color: '#8b5cf6', fontWeight: 'bold', display: 'block', marginTop: '2px' }}>🏢 {item.fornecedor_sugerido}</span>
                    )}
                    {item.qtd_bonificada_cliente > 0 && (
                       <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 'bold', display: 'block', marginTop: '2px' }}>🎁 Possui Bonificação</span>
                    )}
                 </div>
              </div>
            )})}
            {demandas.length > 0 && demandas.every(d => itensJaAgrupados.includes(d.nome)) && (
               <div style={{ textAlign: 'center', padding: '40px', color: '#22c55e', backgroundColor: '#fff', borderRadius: '16px', fontWeight: 'bold' }}>Todos os itens já foram agrupados! Vá para a aba "Pedidos Agrupados".</div>
            )}
          </div>

          {itensSelecionados.length > 0 && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', backgroundColor: '#fff', padding: '20px', boxShadow: '0 -10px 30px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 1000, boxSizing: 'border-box' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <strong style={{ color: '#8b5cf6' }}>{itensSelecionados.length} Itens Selecionados</strong>
                 <button onClick={() => setItensSelecionados([])} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold' }}>Limpar</button>
               </div>
               
               <button onClick={abrirModalFracionarLote} style={{ width: '100%', background: '#f59e0b', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '13px' }}>
                 🧩 AGRUPAR FRACIONADO (POR LOJA)
               </button>
               
               <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                 <div style={{flex: 1, borderTop: '1px solid #e2e8f0'}}></div>
                 <span style={{fontSize: '9px', color: '#94a3b8', fontWeight: 'bold'}}>OU AGRUPAR TODOS</span>
                 <div style={{flex: 1, borderTop: '1px solid #e2e8f0'}}></div>
               </div>

               <div style={{ display: 'flex', gap: '10px' }}>
                 <input list="lista-fornecedores" placeholder="Nome do Fornecedor..." value={nomeFornecedorLote} onChange={e => setNomeFornecedorLote(e.target.value)} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: '2px solid #e2e8f0', outline: 'none', textTransform: 'uppercase', fontWeight: 'bold' }} />
                 <button onClick={criarGrupoFornecedor} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>AGRUPAR</button>
               </div>
            </div>
          )}
        </div>
      )}

      {/* Aba Pedidos Agrupados: lança preços e finaliza grupos por fornecedor. */}
      {abaAtiva === 'pedidos_fornecedor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {agrupamentos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '20px' }}>Nenhum fornecedor agrupado. Vá na aba "Selecionar Forn." para criar.</div>
          ) : (
            agrupamentos.map((grupo) => {
              const expandido = grupoExpandido === grupo.id;
              
              const lojasDoGrupo = {};
              grupo.itens.forEach(nomeItem => {
                 const dItem = demandas.find(d => d.nome === nomeItem);
                 if(dItem) {
                   dItem.lojas.forEach(l => {
                      if (!grupo.lojasRestritas || grupo.lojasRestritas.includes(l.loja_id)) {
                          if(!lojasDoGrupo[l.nome_fantasia]) lojasDoGrupo[l.nome_fantasia] = { id: l.loja_id, itens: [] };
                          lojasDoGrupo[l.nome_fantasia].itens.push({ nome: nomeItem, qtd: l.qtd_pedida, unidade: dItem.unidade });
                      }
                   });
                 }
              });

              return (
              <div key={grupo.id} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', borderTop: '5px solid #14b8a6' }}>
                  
                  <div onClick={() => setGrupoExpandido(expandido ? null : grupo.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <h3 style={{ margin: 0, color: '#111', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      🏢 {grupo.fornecedor} 
                      <span style={{background: '#f1f5f9', color: '#64748b', fontSize: '11px', padding: '3px 8px', borderRadius: '8px'}}>{grupo.itens.length} itens</span>
                      {grupo.lojasRestritas && <span style={{background: '#fef3c7', color: '#d97706', fontSize: '9px', padding: '3px 6px', borderRadius: '6px', fontWeight: 'bold'}}>Fracionado</span>}
                    </h3>
                    <span style={{ color: '#ccc', transform: expandido ? 'rotate(90deg)' : 'none', transition: '0.2s', fontSize: '18px' }}>❯</span>
                 </div>

                 {expandido && (
                   <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #f1f5f9' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                        <button onClick={() => removerGrupoFornecedor(grupo.id)} style={{ background: '#fef2f2', color: '#ef4444', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>❌ Desfazer Grupo</button>
                     </div>

                     <div style={{ backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#64748b' }}>💰 LANÇAR PREÇOS E FINALIZAR:</h4>
                        {grupo.itens.map(nomeItem => {
                           const demandaReal = demandas.find(d => d.nome === nomeItem);
                           if (!demandaReal) return null;

                           const lojasFiltradas = grupo.lojasRestritas 
                             ? demandaReal.lojas.filter(l => grupo.lojasRestritas.includes(l.loja_id))
                             : demandaReal.lojas;
                           
                           if (lojasFiltradas.length === 0) return null;

                           const demandaCalculada = lojasFiltradas.reduce((sum, l) => sum + l.qtd_pedida, 0);
                           const bonifCalculada = lojasFiltradas.reduce((sum, l) => sum + l.qtd_bonificada_cliente, 0);
                           const temBonificacao = bonifCalculada > 0;
                           
                           const prodDB = produtosBd.find(p => p.nome.toUpperCase() === nomeItem);
                           let pesoInfo = '';
                           if (prodDB && prodDB.unidade_medida === 'KG' && prodDB.peso_caixa) {
                             pesoInfo = `(Caixa de ${prodDB.peso_caixa}Kg) - Total Kg: ${demandaCalculada * parseFloat(prodDB.peso_caixa)}`;
                           }

                           return (
                             <div key={nomeItem} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid #e2e8f0', backgroundColor: temBonificacao ? '#fefce8' : 'transparent', padding: temBonificacao ? '10px' : '0', borderRadius: '8px' }}>
                                <div style={{ flex: 1 }}>
                                  <strong style={{ display: 'block', fontSize: '13px', color: '#111' }}>{nomeItem}</strong>
                                  <small style={{ color: '#8b5cf6', fontWeight: '900', fontSize: '12px', display: 'block', marginTop: '2px' }}>{calcularPrecoFinalSugestao(nomeItem)}</small>
                                  {prodDB && prodDB.fornecedor_nome && (
                                     <small style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: '10px', display: 'block' }}>🏢 {prodDB.fornecedor_nome}</small>
                                  )}
                                   <small style={{ color: '#f97316', fontWeight: 'bold', fontSize: '10px', display: 'block' }}>Pediram: {demandaCalculada} {demandaReal.unidade}</small>
                                   {pesoInfo && <small style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: '9px', display: 'block', marginTop: '2px' }}>{pesoInfo}</small>}
                                   
                                   {temBonificacao && (
                                     <div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                       <div>
                                           <span style={{display: 'block', fontSize: '10px', color: '#d97706', fontWeight: 'bold'}}>⚠️ Pedido de bonificação:</span>
                                           {lojasFiltradas.filter(l => l.qtd_bonificada_cliente > 0).map(l => (
                                              <span key={l.loja_id} style={{ display: 'block', fontSize: '9px', color: '#b45309' }}>
                                                - <b>{l.nome_fantasia}</b>: {l.qtd_pedida} pagos + {l.qtd_bonificada_cliente} bonificados
                                              </span>
                                           ))}
                                       </div>
                                       <div style={{ display: 'flex', gap: '5px' }}>
                                         <button onClick={() => {
                                             mostrarNotificacao(`✅ Bonificação de ${nomeItem} aceita.`, 'sucesso');
                                           }} style={{ background: '#f97316', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
                                             ACEITAR
                                         </button>
                                         <button onClick={() => rejeitarBonificacaoGrupo(nomeItem, lojasFiltradas)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '9px', fontWeight: 'bold', cursor: 'pointer' }}>
                                             RECUSAR E AJUSTAR TOTAL
                                         </button>
                                       </div>
                                     </div>
                                   )}

                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                  <button onClick={() => marcarFaltaDoAgrupamento(nomeItem, lojasFiltradas, grupo.id)} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }} title="Marcar falta em todas as lojas">
                                      🚫 FALTA
                                  </button>
                                  
                                  <div style={{ position: 'relative', width: '100px' }}>
                                     <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}>R$</span>
                                     <input 
                                       type="text" 
                                       placeholder="0,00"
                                       value={precosAgrupados[`${grupo.id}_${nomeItem}`] !== undefined ? precosAgrupados[`${grupo.id}_${nomeItem}`] : (demandaReal.preco_sugerido ? demandaReal.preco_sugerido.replace('R$ ', '') : '')}
                                       onChange={(e) => setPrecosAgrupados({...precosAgrupados, [`${grupo.id}_${nomeItem}`]: e.target.value})}
                                       style={{ width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', fontWeight: 'bold' }}
                                     />
                                  </div>
                                </div>
                             </div>
                           );
                         })}
                         
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                           <div style={{ display: 'flex', gap: '10px' }}>
                             <button onClick={() => finalizarLoteFornecedor(grupo.id, 'avista')} style={{ flex: 1, padding: '15px', background: '#111', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>FECHAR À VISTA</button>
                             <button onClick={() => finalizarLoteFornecedor(grupo.id, 'boleto')} style={{ flex: 1, padding: '15px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}>FECHAR NO BOLETO</button>
                           </div>
                         </div>
                       </div>
                    </div>
                  )}
              </div>
              );
            })
          )}
        </div>
      )}

      {/* Aba Feitos: mostra o que já foi resolvido e permite desfazer ou marcar falta. */}
      {abaAtiva === 'feitos' && (
        <>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Procurar concluídos..." value={buscaFeitos} onChange={e => setBuscaFeitos(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {pedidosFeitos.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '16px' }}>Nada concluído ainda.</div>
            ) : (
              pedidosFeitos.filter(d => removerAcentos(d.nome).includes(removerAcentos(buscaFeitos))).map(item => (
                <div key={item.nome} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '15px', borderTop: '4px solid #3b82f6', opacity: 0.8, cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '5px', right: '5px' }}>
                    <button onClick={(e) => marcarFaltaFeitoGeral(item, e)} style={{ background: '#fef2f2', color: '#ef4444', border: 'none', padding: '4px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }} title="Marcar Falta em TUDO">🚫</button>
                  </div>
                  <div onClick={() => setExpandidoFeito(expandidoFeito === item.nome ? null : item.nome)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '10px', borderRadius: '50%', fontWeight: '900', fontSize: '18px', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                      {item.total_resolvido}
                    </div>
                    <strong style={{ fontSize: '13px', color: '#111', lineHeight: '1.2' }}>{item.nome}</strong>
                    <span style={{ fontSize: '9px', color: '#666', marginTop: '5px' }}>{item.itens.length} NOTA(S)</span>
                    <span style={{ fontSize: '9px', color: '#3b82f6', marginTop: '8px', fontWeight: 'bold' }}>{expandidoFeito === item.nome ? 'Ocultar fornecedores ▲' : 'Ver fornecedores ▼'}</span>
                  </div>

                  {expandidoFeito === item.nome && (
                    <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #e2e8f0', width: '100%', cursor: 'default' }}>
                       {Object.entries(
                          item.itens.reduce((acc, p) => {
                             const f = String(p.fornecedor_compra || 'DESCONHECIDO').replace('ALERTA|', '').toUpperCase();
                             if(!acc[f]) acc[f] = [];
                             acc[f].push(p);
                             return acc;
                          }, {})
                       ).map(([forn, peds]) => (
                         <div key={forn} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#f8fafc', padding: '10px', borderRadius: '8px', marginBottom: '5px' }}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                 <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                                    <strong style={{fontSize: '11px', color: '#334155'}}>🏢 {forn}</strong>
                                    <span style={{fontSize: '10px', color: '#64748b'}}>Comprado: {peds.reduce((s, p) => s + Number(p.qtd_atendida || 0), 0)} {item.unidade}</span>
                                 </div>
                                 <button onClick={(e) => desfazerFeitoPorFornecedor(peds, forn, e)} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', padding: '6px 10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '9px', cursor: 'pointer' }}>
                                    ✖ DESFAZER
                                 </button>
                             </div>
                          </div>
                       ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Aba Fornecedores: mostra notas por fornecedor, totais, Pix, boleto e WhatsApp. */}
      {abaAtiva === 'fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: '1px solid #e2e8f0' }}>
            <span>🔍</span><input placeholder="Buscar fornecedor..." value={buscaFornecedores} onChange={e => setBuscaFornecedores(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          <button onClick={gerarResumoConferencia} style={{ width: '100%', background: '#111', color: '#fff', border: 'none', padding: '16px', borderRadius: '12px', fontWeight: '900', fontSize: '13px', cursor: 'pointer' }}>
            📝 CONFERÊNCIA CONCLUÍDA (COPIAR RESUMO)
          </button>

          {fornecedoresBd.length > 0 && (
  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
    <button onClick={() => setFiltroForn('todos')} style={{ flexShrink: 0, padding: '8px 12px', borderRadius: '10px', border: filtroForn === 'todos' ? '2px solid #111' : '1px solid #cbd5e1', background: filtroForn === 'todos' ? '#111' : '#fff', color: filtroForn === 'todos' ? '#fff' : '#334155', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>
      Todos ({fornecedoresBd.length})
    </button>
    {ABAS_FORN.map(aba => {
      const qtd = fornecedoresBd.filter(f => pertenceAba(f, aba.id)).length;
      if (qtd === 0) return null;
      const ativa = filtroForn === aba.id;
      return (
        <button key={aba.id} onClick={() => setFiltroForn(ativa ? 'todos' : aba.id)} style={{ flexShrink: 0, padding: '8px 12px', borderRadius: '10px', border: `2px solid ${aba.cor}`, background: ativa ? aba.cor : aba.fundo, color: ativa ? '#fff' : aba.cor, fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>
          {aba.label} ({qtd})
        </button>
      );
    })}
  </div>
)}

          {fornecedoresBd.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '20px' }}>Nenhum fornecedor acionado.</div>
          ) : (
            fornecedoresBd.filter(f => removerAcentos(f.nome).includes(removerAcentos(buscaFornecedores)) && pertenceAba(f, filtroForn)).map((f, idx) => {
              const expandido = fornExpandido === f.nome;
              const temAlerta = f.precisaRefazer;
              
              const temCadastro = fornecedoresOficiais.some(oficial => (oficial.nome_fantasia || '').toUpperCase() === f.nome || (oficial.nome_completo || '').toUpperCase() === f.nome);
              
              const todasLojasCopiadas = Object.values(f.lojas).length > 0 && Object.values(f.lojas).every(loja => loja.wpp_enviado);
              const mods = calcularModificacoes(f);
              const reenviar = Object.keys(mods.lojas).length > 0 || mods.removidas.length > 0;
              const conferido = !!(enviosForn[f.nome] && enviosForn[f.nome].conferido) && todasLojasCopiadas && !reenviar;

              let estiloBorda = temCadastro ? '6px solid #111' : '6px solid #ef4444';
              let iconeTopo = '';
              let corH3 = '#111';
              let badgeFundo = '#dcfce7';
              let badgeTexto = '#166534';

              if (reenviar) {
                  estiloBorda = '6px solid #f97316';
                  iconeTopo = '🔁 REENVIAR';
                  corH3 = '#ea580c';
                  badgeFundo = '#ffedd5';
                  badgeTexto = '#c2410c';
              } else if (temAlerta) {
                  estiloBorda = '6px solid #ef4444';
                  iconeTopo = '⚠️ ALERTA';
                  corH3 = '#ef4444';
                  badgeFundo = '#fef2f2';
                  badgeTexto = '#ef4444';
              } else if (conferido) {
                  estiloBorda = '6px solid #3b82f6';
                  iconeTopo = '🔵 CONFERIDO';
                  corH3 = '#1d4ed8';
                  badgeFundo = '#dbeafe';
                  badgeTexto = '#1e40af';
              } else if (todasLojasCopiadas) {
                  estiloBorda = '6px solid #22c55e';
                  iconeTopo = '✅ ENVIADO';
                  corH3 = '#16a34a';
              }

              const exigePara2 = fornecedorEnviaPara2(f);
              const para2Ok = !!(enviosForn[f.nome] && enviosForn[f.nome].para2Ok);
              const nome2 = nomeSegundoEnvio(f);

              return (
                <div key={idx} style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '20px', boxShadow: '0 5px 15px rgba(0,0,0,0.05)', borderTop: estiloBorda, transition: '0.3s' }}>
                  
                  <div onClick={() => { if(editandoNomeForn !== f.nome) setFornExpandido(expandido ? null : f.nome) }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: editandoNomeForn === f.nome ? 'default' : 'pointer' }}>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ margin: 0, fontSize: '16px', color: corH3, textTransform: 'uppercase', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            🏢 
                            {editandoNomeForn === f.nome ? (
                              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                <input list="lista-fornecedores" value={novoNomeForn} onChange={e => setNovoNomeForn(e.target.value)} style={{ padding: '4px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc', outline: 'none' }} onClick={e => e.stopPropagation()} />
                                <button onClick={(e) => { e.stopPropagation(); salvarNovoNomeFornecedor(f.nome); }} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontWeight: 'bold' }}>OK</button>
                                <button onClick={(e) => { e.stopPropagation(); setEditandoNomeForn(null); }} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                              </div>
                            ) : (
                              <>
                                {f.nome} 
                                <button onClick={(e) => { e.stopPropagation(); setEditandoNomeForn(f.nome); setNovoNomeForn(f.nome); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }} title="Editar Fornecedor">✏️</button>
                                {!temCadastro && <span style={{ background: '#ef4444', color: '#fff', fontSize: '9px', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>⚠️ SEM CADASTRO</span>}
                              </>
                            )}
                            {iconeTopo && <span style={{fontSize: '10px', background: badgeFundo, padding: '4px 8px', borderRadius: '6px', color: badgeTexto}}>{iconeTopo}</span>}

                            {exigePara2 && (
                              <span style={{ fontSize: '10px', background: para2Ok ? '#ede9fe' : '#7c3aed', color: para2Ok ? '#5b21b6' : '#fff', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                                {para2Ok ? '👥 ENVIADO P/ 2 ✓' : '👥 ENVIAR PARA 2'}
                              </span>
                            )}
                        </h3>

                        {exigePara2 && nome2 && (
                          <div style={{ marginTop: '8px', fontSize: '11px', fontWeight: 'bold', color: para2Ok ? '#5b21b6' : '#7c3aed', background: '#faf5ff', border: '1px solid #c4b5fd', padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
                            👥 Enviar também para: <b>{nome2}</b>
                          </div>
                        )}
                        
                        {!expandido && f.resumo && Object.keys(f.resumo).length > 0 && (
                           <div style={{ marginTop: '10px', fontSize: '11px', color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                              {Object.entries(f.resumo).map(([nome, info]) => (
                                 <span key={nome} style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                  {info.qtd}x {nome}
                                  {precoCurtoResumo(f, nome) && <b style={{ color: '#16a34a', marginLeft: '4px' }}>{precoCurtoResumo(f, nome)}</b>}
                                </span>
                              ))}
                           </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <strong style={{ color: '#22c55e', fontSize: '18px' }}>{formatarMoeda(f.totalGeral)}</strong>
                      <span style={{ color: '#ccc', transform: expandido ? 'rotate(90deg)' : 'none', transition: '0.2s' }}>❯</span>
                    </div>
                  </div>

                  {expandido && (
                    <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #f1f5f9' }}>
                      
                      {temAlerta && (
                         <div style={{ backgroundColor: '#fef2f2', border: '1px dashed #ef4444', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                            <strong style={{ color: '#ef4444', fontSize: '12px', display: 'block', marginBottom: '5px' }}>🚨 ATENÇÃO: PEDIDO MODIFICADO NO FECHAMENTO!</strong>
                            <p style={{ fontSize: '11px', color: '#991b1b', margin: '0 0 10px 0' }}>
                               Os itens a seguir foram desfeitos, marcados como falta ou tiveram preço alterado nas lojas. Eles <b>voltaram para a aba de PENDENTES</b> e o total deste fornecedor já foi reduzido:
                               <br/><br/><b>{f.alertas.join(', ')}</b>
                            </p>
                            <button onClick={() => limparAlertaFornecedor(f.nome)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>
                                ✅ CIENTE (Omitir Alerta)
                            </button>
                         </div>
                      )}

                      <button onClick={() => setModalNomesFornecedor(f)} style={{ width: '100%', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer', marginBottom: '20px' }}>
                        ⚙️ Nomes Personalizados para o WhatsApp
                      </button>

                      <div style={{ backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#111' }}>🛍️ PEDIDO GERAL DA BANCA</h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <select 
                             value={lojaGeralSelecionada[f.nome] || ''} 
                             onChange={e => setLojaGeralSelecionada({...lojaGeralSelecionada, [f.nome]: e.target.value})}
                             style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '100%', fontWeight: 'bold', color: '#334155' }}
                          >
                             <option value="" disabled>Escolha a Loja Titular (Cabeçalho)...</option>
                             {ordenarLojas(Object.values(f.lojas)).map(loja => <option key={loja.nome} value={loja.nome}>{loja.nome}</option>)}
                          </select>

                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '900', fontSize: '12px', backgroundColor: enviarTotalPorForn[f.nome] ? '#dcfce7' : '#fff', color: enviarTotalPorForn[f.nome] ? '#166534' : '#64748b', border: enviarTotalPorForn[f.nome] ? '1px solid #86efac' : '1px solid #cbd5e1' }}>
                            <input
                              type="checkbox"
                              checked={!!enviarTotalPorForn[f.nome]}
                              onChange={e => setEnviarTotalPorForn({ ...enviarTotalPorForn, [f.nome]: e.target.checked })}
                              style={{ width: '18px', height: '18px' }}
                            />
                            💰 ENVIAR TOTAL?
                          </label>

                          {enviarTotalPorForn[f.nome] && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '900', fontSize: '12px', backgroundColor: semTotalPorForn[f.nome] ? '#fffbeb' : '#fff', color: semTotalPorForn[f.nome] ? '#d97706' : '#64748b', border: semTotalPorForn[f.nome] ? '1px solid #fde68a' : '1px solid #cbd5e1' }}>
                              <input
                                type="checkbox"
                                checked={!!semTotalPorForn[f.nome]}
                                onChange={e => setSemTotalPorForn({ ...semTotalPorForn, [f.nome]: e.target.checked })}
                                style={{ width: '18px', height: '18px' }}
                              />
                              🚫 ENVIAR SEM TOTAL?
                            </label>
                          )}

                          <button 
                             onClick={() => gerarPedidoGeral(f)} 
                             disabled={!localCompra}
                             style={{ flex: 1, background: !localCompra ? '#ccc' : (reenviar ? '#f97316' : (todasLojasCopiadas ? '#22c55e' : '#111')), color: '#fff', border: 'none', padding: '15px', borderRadius: '10px', fontWeight: '900', fontSize: '12px', cursor: !localCompra ? 'not-allowed' : 'pointer', transition: '0.2s' }}
                          >
                             {!localCompra ? '⚠️ SELECIONE CEASA/CEILÂNDIA NO TOPO' : (reenviar ? '🔁 REENVIAR PEDIDO GERAL' : (todasLojasCopiadas ? '✅ GERAL ENVIADO!' : '📋 COPIAR PEDIDO GERAL'))}
                          </button>
                        </div>
                      </div>
                      

                     {todasLojasCopiadas && !reenviar && (
  <>
                        {exigePara2 && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: '900', fontSize: '12px', marginBottom: '10px', backgroundColor: para2Ok ? '#ede9fe' : '#faf5ff', color: '#5b21b6', border: '2px solid #7c3aed' }}>
                            <input type="checkbox" checked={para2Ok} onChange={() => alternarPara2(f.nome)} style={{ width: '18px', height: '18px', accentColor: '#7c3aed' }} />
                            👥 ENVIADO PARA {nome2 ? nome2.toUpperCase() : 'A 2ª PESSOA'}
                          </label>
                        )}
                        <button
                          onClick={() => alternarConferencia(f.nome)}
                          disabled={exigePara2 && !para2Ok && !conferido}
                          style={{ width: '100%', background: (exigePara2 && !para2Ok && !conferido) ? '#ccc' : (conferido ? '#dbeafe' : '#3b82f6'), color: conferido ? '#1e40af' : '#fff', border: conferido ? '1px solid #93c5fd' : 'none', padding: '14px', borderRadius: '10px', fontWeight: '900', fontSize: '12px', cursor: (exigePara2 && !para2Ok && !conferido) ? 'not-allowed' : 'pointer', marginBottom: '20px' }}
                        >
                          {conferido ? '🔵 CONFERIDO (clique para desfazer)' : ((exigePara2 && !para2Ok) ? '👥 MARQUE O ENVIO PARA A 2ª PESSOA' : '🔵 CONFIRMAR CONFERÊNCIA')}
                        </button>
                      </>
                    )}

                      {mods.removidas.length > 0 && (
                        <div style={{ backgroundColor: '#fff7ed', border: '2px solid #f97316', padding: '12px', borderRadius: '12px', marginBottom: '15px' }}>
                          <strong style={{ color: '#c2410c', fontSize: '12px', display: 'block', marginBottom: '5px' }}>🔁 LOJAS REMOVIDAS DESTE PEDIDO (reenvie o pedido geral):</strong>
                          {mods.removidas.map(r => (
                            <span key={r.nome} style={{ display: 'block', fontSize: '11px', color: '#9a3412' }}>• <b>{r.nome}</b>: {r.detalhes.join(' • ')}</span>
                          ))}
                        </div>
                      )}


                      <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#111', paddingLeft: '5px' }}>📦 PEDIDOS SEPARADOS POR LOJA</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {ordenarLojas(Object.values(f.lojas)).map((loja, lIdx) => {
                          const nomeFormatado = loja.nome.replace(/^\d+\s*-\s*/, '').trim().toUpperCase();
                          const modLoja = mods.lojas[loja.nome];

                          return (
                            <div key={lIdx} style={{ backgroundColor: modLoja ? '#fff7ed' : '#f8fafc', padding: '15px', borderRadius: '12px', border: modLoja ? '2px solid #f97316' : '1px dashed #e2e8f0' }}>
                              <strong style={{ fontSize: '14px', color: '#111', display: 'block', marginBottom: '10px' }}>{nomeFormatado}</strong>

                              {modLoja && (
                                <div style={{ background: '#ffedd5', padding: '8px 10px', borderRadius: '8px', marginBottom: '10px' }}>
                                  <strong style={{ color: '#c2410c', fontSize: '11px', display: 'block' }}>🔁 LOJA MODIFICADA ({modLoja.tipo})</strong>
                                  <span style={{ fontSize: '10px', color: '#9a3412' }}>{modLoja.detalhes.join(' • ')}</span>
                                </div>
                              )}

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
                                {loja.itens.map((item, idxx) => (
                                  <div key={idxx} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                      <span>{item.qtd} <b>{getNomeExibicaoWhatsApp(f.nome, item.nome, item.unidade)}</b></span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      {item.qtd_bonificada > 0 && (
                                        <span style={{ fontSize: '9px', background: '#dcfce7', color: '#166534', padding: '2px 5px', borderRadius: '4px', fontWeight: 'bold' }}>🎁 +{item.qtd_bonificada}</span>
                                      )}
                                      <button onClick={() => cancelarItemUnicoDoFornecedor(item.id_pedido, item.nome)} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }} title="Cancelar e devolver para pendentes">✖</button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <button
                                onClick={() => copiarMensagemWhatsapp(loja.nome, loja, f.nome, f)}
                                disabled={!localCompra}
                                style={{ width: '100%', background: !localCompra ? '#ccc' : (modLoja ? '#f97316' : (loja.wpp_enviado ? '#dcfce7' : '#25d366')), color: !localCompra ? '#fff' : (modLoja ? '#fff' : (loja.wpp_enviado ? '#166534' : '#fff')), border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: !localCompra ? 'not-allowed' : 'pointer', transition: '0.2s' }}
                              >
                                {!localCompra ? '⚠️ SELECIONE CEASA/CEILÂNDIA' : (modLoja ? '🔁 REENVIAR LISTA DA LOJA' : (loja.wpp_enviado ? '✅ COPIADO PARA O WHATSAPP' : '🟢 COPIAR LISTA DA LOJA'))}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 💡 NOVO MODAL: AGRUPAR FRACIONADO POR LOJA */}
      {modalFracionarLoteAberto && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 11000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
              <div style={{ background: '#fff', width: '100%', maxWidth: '500px', borderRadius: '20px', padding: '20px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', color: '#111' }}>🧩 Agrupar Fracionado (Por Loja)</h3>
                      <button onClick={() => setModalFracionarLoteAberto(false)} style={{ background: '#eee', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px', paddingRight: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '10px' }}>SELECIONE AS LOJAS PARA ATRIBUIR O FORNECEDOR:</label>
                      <button onClick={() => setFracionarLojasSelecionadas(fracionarLojasDisp.filter(l => !fracionarAtribuicoes[l.id]).map(l => l.id))} style={{marginBottom: '10px', fontSize: '10px', padding: '6px 12px', background: '#e2e8f0', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', color: '#475569'}}>Selecionar Todas as Restantes</button>
                      
                      {fracionarLojasDisp.map(loja => {
                          const isAtribuido = !!fracionarAtribuicoes[loja.id];
                          const isSelecionado = fracionarLojasSelecionadas.includes(loja.id);
                          return (
                              <div key={loja.id} onClick={() => toggleLojaFracionada(loja.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: isAtribuido ? '#dcfce7' : (isSelecionado ? '#f3e8ff' : '#f8fafc'), borderBottom: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '5px', cursor: isAtribuido ? 'default' : 'pointer' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      {!isAtribuido && <input type="checkbox" checked={isSelecionado} readOnly style={{ width: '18px', height: '18px', accentColor: '#8b5cf6', pointerEvents: 'none' }} />}
                                      <span style={{ fontSize: '14px', fontWeight: 'bold', color: isAtribuido ? '#166534' : '#334155', textDecoration: isAtribuido ? 'line-through' : 'none' }}>{loja.nome}</span>
                                  </div>
                                  {isAtribuido && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <span style={{fontSize: '11px', background: '#166534', color: '#fff', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold'}}>🏢 {fracionarAtribuicoes[loja.id]}</span>
                                          <button onClick={(e) => { e.stopPropagation(); resetarAtribuicao(loja.id); }} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: '900', fontSize: '16px', cursor: 'pointer' }}>✕</button>
                                      </div>
                                  )}
                              </div>
                          )
                      })}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                      <input list="lista-fornecedores" placeholder="Nome do Fornecedor..." value={fracionarFornecedor} onChange={e => setFracionarFornecedor(e.target.value)} style={{ flex: 1, padding: '15px', borderRadius: '12px', border: '2px solid #e2e8f0', outline: 'none', textTransform: 'uppercase', fontWeight: 'bold', fontSize: '14px' }} />
                      <button onClick={atribuirFornecedorLojas} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '12px' }}>ATRIBUIR</button>
                  </div>

                  {Object.keys(fracionarAtribuicoes).length === fracionarLojasDisp.length && fracionarLojasDisp.length > 0 ? (
                      <button onClick={finalizarAgrupamentoFracionado} style={{ width: '100%', padding: '18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '14px' }}>
                          FINALIZAR PEDIDO FRACIONADO
                      </button>
                  ) : (
                      <div style={{ textAlign: 'center', fontSize: '12px', color: '#ef4444', fontWeight: 'bold', padding: '10px', background: '#fef2f2', borderRadius: '8px' }}>Atribua fornecedor a todas as lojas para finalizar.</div>
                  )}
              </div>
          </div>
      )}

      {modalNomesFornecedor && (
         <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 11000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '400px', borderRadius: '20px', padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#111' }}>Personalizar Nomes</h3>
                  <button onClick={() => setModalNomesFornecedor(null)} style={{ background: '#eee', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
               </div>
               <p style={{ fontSize: '11px', color: '#666', marginBottom: '20px' }}>O nome digitado aqui será usado apenas nas cópias para o WhatsApp para o fornecedor <b>{modalNomesFornecedor.nome}</b>.</p>
               
               {Array.from(new Set(Object.values(modalNomesFornecedor.lojas).flatMap(l => l.itens.map(i => i.nome)))).map(nomeOriginal => {
                    const configsAtuais = nomesPersonalizados[modalNomesFornecedor.nome] || {};
                    const configDesteItem = configsAtuais[nomeOriginal] || { nome: formatarNomeItem(nomeOriginal), usarUnidade: false };

                    return (
                      <div key={nomeOriginal} style={{ marginBottom: '15px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>{nomeOriginal}</span>
                        <input 
                           type="text" 
                           value={configDesteItem.nome}
                           onChange={(e) => {
                            setNomesPersonalizados(prev => ({
                                ...prev,
                                [modalNomesFornecedor.nome]: {
                                    ...(prev[modalNomesFornecedor.nome] || {}),
                                    [nomeOriginal]: { ...configDesteItem, nome: e.target.value.toUpperCase() }
                                }
                            }));
                           }}
                           style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', marginBottom: '8px', fontWeight: 'bold' }}
                        />
                        <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                           <input 
                             type="checkbox" 
                             checked={configDesteItem.usarUnidade} 
                             onChange={(e) => {
                                setNomesPersonalizados(prev => ({
                                    ...prev,
                                    [modalNomesFornecedor.nome]: {
                                        ...(prev[modalNomesFornecedor.nome] || {}),
                                        [nomeOriginal]: { ...configDesteItem, usarUnidade: e.target.checked }
                                    }
                                }));
                             }} 
                           />
                           Incluir Unidade de Medida (Ex: CX, KG) na mensagem?
                        </label>
                      </div>
                    );
               })}
               <button onClick={() => setModalNomesFornecedor(null)} style={{ width: '100%', background: '#111', color: '#fff', padding: '15px', borderRadius: '12px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>SALVAR</button>
            </div>
         </div>
      )}

      {/* Aba Resumo Itens: acompanha pedido total, comprado, pendente e PDF. */}
      {abaAtiva === 'lista_fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: '1px solid #e2e8f0', flex: 1 }}>
                <span>🔍</span><input placeholder="Buscar produto..." value={buscaFornList} onChange={e => setBuscaFornList(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
              </div>
              <button onClick={() => setModoImpressaoResumo(true)} style={{ background: '#111', color: '#fff', border: 'none', padding: '0 20px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                📥 GERAR PDF
              </button>
          </div>

          <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '15px', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>
             <span style={{ color: '#16a34a' }}>🟢 Comprado 100%</span>
             <span style={{ color: '#ef4444' }}>🔴 Falta Comprar (Pendente)</span>
             <span style={{ color: '#d97706' }}>🟡 Comprado Parcial</span>
             <span style={{ color: '#64748b', textDecoration: 'line-through' }}>⚫ Falta Assumida</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {listaGeralItens.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '20px' }}>Nenhum pedido hoje.</div>
            ) : (
              listaGeralItens.filter(f => removerAcentos(f.nome).includes(removerAcentos(buscaFornList))).map((item, idx) => {
                
                let corFundo = '#fff';
                let corBorda = '#e2e8f0';
                let corTexto = '#111';
                let statusMsg = '';
                let textoRiscado = 'none';

                if (item.isFaltaTotal) {
                   corFundo = '#f1f5f9';
                   corBorda = '#cbd5e1';
                   corTexto = '#64748b';
                   textoRiscado = 'line-through';
                   statusMsg = 'FALTA ASSUMIDA';
                } else if (item.total_comprado === 0) {
                   corFundo = '#fef2f2';
                   corBorda = '#fecaca';
                   corTexto = '#ef4444';
                   statusMsg = 'PENDENTE 100%';
                } else if (item.total_comprado < item.total_solicitado) {
                   corFundo = '#fffbeb';
                   corBorda = '#fde68a';
                   corTexto = '#d97706';
                   statusMsg = `FALTA COMPRAR: ${item.total_solicitado - item.total_comprado}`;
                } else if (item.total_comprado >= item.total_solicitado) {
                   corFundo = '#dcfce7';
                   corBorda = '#bbf7d0';
                   corTexto = '#166534';
                   statusMsg = 'COMPLETO';
                }

                const cardExpandido = itemResumoExpandido === item.nome;

                return (
                  <div key={idx} onClick={() => setItemResumoExpandido(cardExpandido ? null : item.nome)} style={{ backgroundColor: corFundo, borderRadius: '12px', padding: '15px', border: `1px solid ${corBorda}`, cursor: 'pointer', transition: '0.2s' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ fontSize: '15px', color: corTexto, textDecoration: textoRiscado, display: 'block' }}>{formatarNomeItem(item.nome)}</strong>
                        <span style={{ fontSize: '11px', color: corTexto, fontWeight: 'bold', display: 'block', marginTop: '2px', opacity: 0.8 }}>Total Pedido Lojas: {item.total_solicitado} {item.unidade}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                         <div style={{ fontSize: '10px', fontWeight: '900', color: corTexto, padding: '4px 8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px', display: 'inline-block' }}>
                             {statusMsg}
                         </div>
                      </div>
                    </div>

                    {cardExpandido && Object.keys(item.fornecedores_comprados || {}).length > 0 && (
                      <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: `1px dashed ${corBorda}` }}>
                         <span style={{ fontSize: '10px', fontWeight: 'bold', color: corTexto, opacity: 0.8, display: 'block', marginBottom: '8px' }}>COMPRADO COM:</span>
                         {Object.entries(item.fornecedores_comprados).map(([fornNome, data]) => (
                             <div key={fornNome} style={{ fontSize: '12px', color: corTexto, fontWeight: 'bold', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                 <span>🏢 {fornNome} {data.isBoleto && '(B)'}</span>
                                 <span>{data.qtd}x</span>
                             </div>
                         ))}
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Modal de impressão: prévia do resumo que será baixado/compartilhado como PDF. */}
      {modoImpressaoResumo && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: '#fff', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
             <h2 style={{margin:0, fontSize: '18px'}}>Resumo para PDF</h2>
             <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => processarPDFResumo('whatsapp')} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Compartilhar WhatsApp</button>
                <button onClick={() => processarPDFResumo('baixar')} style={{ background: '#111', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Baixar PDF</button>
                <button onClick={() => setModoImpressaoResumo(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Fechar</button>
             </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#525659' }}>
             <div id="area-impressao-resumo" style={{ background: '#fff', padding: '30px', width: '210mm', minHeight: '297mm', margin: '0 auto', color: '#000', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px' }}>
                   <h1 style={{ margin: 0, fontSize: '24px', textTransform: 'uppercase' }}>RESUMO DE COMPRAS DO DIA</h1>
                   <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>Data: {dataBr} - Gerado pelo VIRTUS</p>
                </div>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                      <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #000' }}>
                        <th style={{ padding: '8px', textAlign: 'left', width: '40%' }}>PRODUTO</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}>PEDIDO</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}>COMPRADO</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}>FALTA</th>
                      </tr>
                  </thead>
                  <tbody>
                      {listaGeralItens.map((item, idx) => {
                        const faltaNum = item.total_solicitado - item.total_comprado;
                        const statusFalta = item.isFaltaTotal ? 'F. ASSUMIDA' : (faltaNum > 0 ? faltaNum : 'OK');
                        const isPendencia = !item.isFaltaTotal && faltaNum > 0;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', color: item.isFaltaTotal ? '#94a3b8' : '#000', fontWeight: isPendencia ? 'bold' : 'normal' }}>
                             <td style={{ padding: '8px', textDecoration: item.isFaltaTotal ? 'line-through' : 'none' }}>{item.nome}</td>
                             <td style={{ padding: '8px', textAlign: 'center' }}>{item.total_solicitado} {item.unidade}</td>
                             <td style={{ padding: '8px', textAlign: 'center' }}>{item.total_comprado} {item.unidade}</td>
                             <td style={{ padding: '8px', textAlign: 'center', color: isPendencia ? '#ef4444' : 'inherit' }}>{statusFalta}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {/* Modal de compra unitária/fracionada: altera fornecedor, quantidade, valor, boleto, crédito, falta e bonificação. */}
      {itemModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', padding: '0' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '600px', borderRadius: '30px 30px 0 0', padding: '30px 25px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '24px', fontWeight: '900', color: '#111' }}>{itemModal.demanda}x {itemModal.nome}</h3>
                <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#64748b', fontWeight: 'bold' }}>
                  Preço Base: <span style={{color:'#f97316'}}>{itemModal.preco_sugerido}</span> | Fornecedor: <span style={{color:'#f97316'}}>{itemModal.fornecedor_sugerido}</span>
                </p>
              </div>
              <button onClick={() => setItemModal(null)} style={{ background: '#f1f5f9', border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>

            {itemModal.qtd_bonificada_cliente > 0 && !dadosCompra.temBonificacao && (
               <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                  <strong style={{ color: '#d97706', fontSize: '13px', display: 'block', marginBottom: '10px' }}>⚠️ O cliente informou bonificação!</strong>
                  <div style={{ fontSize: '11px', color: '#b45309', marginBottom: '15px' }}>
                    {itemModal.lojas.filter(l => l.qtd_bonificada_cliente > 0).map(loja => (
                      <div key={loja.loja_id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #fcd34d', paddingBottom: '4px', marginBottom: '4px' }}>
                        <span>🏪 {loja.nome_fantasia}</span>
                        <span>Pagos: <b>{loja.qtd_pedida}</b> | Bonif: <b>{loja.qtd_bonificada_cliente}</b> | Total: <b>{loja.qtd_pedida + loja.qtd_bonificada_cliente}</b></span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={aceitarBonificacaoCliente} style={{ background: '#f97316', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
                      ACEITAR BONIFICAÇÃO
                    </button>
                    <button onClick={rejeitarBonificacaoCliente} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}>
                      RECUSAR E AJUSTAR TOTAL
                    </button>
                  </div>
               </div>
            )}

            <div style={{ display: 'flex', gap: '10px', backgroundColor: '#f1f5f9', padding: '5px', borderRadius: '12px', marginBottom: '20px' }}>
              <button onClick={() => setAbaModal('completo')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaModal === 'completo' ? '#fff' : 'transparent', color: abaModal === 'completo' ? '#111' : '#64748b' }}>
                📦 PEDIDO COMPLETO
              </button>
              <button onClick={() => setAbaModal('fracionado')} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaModal === 'fracionado' ? '#fff' : 'transparent', color: abaModal === 'fracionado' ? '#111' : '#64748b' }}>
                🧩 PEDIDO FRACIONADO
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: abaModal === 'fracionado' ? '2fr 1fr' : '1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>FORNECEDOR</label>
                <input list="lista-fornecedores" placeholder="Ex: Zé das Frutas..." value={dadosCompra.fornecedor} onChange={(e) => setDadosCompra({...dadosCompra, fornecedor: e.target.value})} disabled={dadosCompra.isFaltaGeral} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', backgroundColor: dadosCompra.isFaltaGeral ? '#f1f5f9' : '#f8fafc' }} />
              </div>
              
              {abaModal === 'completo' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>QTD. A COMPRAR DELE</label>
                    <input type="number" value={dadosCompra.qtd_pedir} onChange={(e) => setDadosCompra({...dadosCompra, qtd_pedir: e.target.value})} disabled={dadosCompra.isFaltaGeral} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontWeight: '900', textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>VALOR UNITÁRIO (R$)</label>
                    <input type="text" placeholder="0,00" value={dadosCompra.valor_unit} onChange={(e) => setDadosCompra({...dadosCompra, valor_unit: e.target.value})} disabled={dadosCompra.isFaltaGeral} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontWeight: '900' }} />
                  </div>
                </div>
              )}

              {abaModal === 'fracionado' && (
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>VALOR UNIT. (R$)</label>
                  <input type="text" placeholder="0,00" value={dadosCompra.valor_unit} onChange={(e) => setDadosCompra({...dadosCompra, valor_unit: e.target.value})} disabled={dadosCompra.isFaltaGeral} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', outline: 'none', boxSizing: 'border-box', fontWeight: '900' }} />
                </div>
              )}
            </div>

            {abaModal === 'fracionado' && (
              <div style={{ backgroundColor: '#fff7ed', padding: '15px', borderRadius: '12px', border: '1px solid #fde68a', marginBottom: '15px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#b45309', display: 'block', marginBottom: '5px' }}>QTD. QUE O FORNECEDOR TEM (Referência):</label>
                <input type="number" value={dadosCompra.qtdFornecedor} onChange={(e) => setDadosCompra({...dadosCompra, qtdFornecedor: e.target.value})} placeholder="Ex: 50" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #fcd34d', fontWeight: 'bold', fontSize: '16px' }} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
              <div style={{ flex: 1, backgroundColor: dadosCompra.temBonificacao ? '#dcfce7' : '#f8fafc', padding: '15px', borderRadius: '12px', border: dadosCompra.temBonificacao ? '1px solid #86efac' : '1px solid #e2e8f0', transition: '0.2s' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: dadosCompra.temBonificacao ? '#166534' : '#64748b', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dadosCompra.temBonificacao} disabled={dadosCompra.isFaltaGeral} onChange={(e) => setDadosCompra({...dadosCompra, temBonificacao: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                  🎁 INCLUIR BONIFICAÇÃO
                </label>
              </div>
              {abaModal === 'completo' && (
                <>
                  {/* BOLETO: impede cobrança imediata em dinheiro/Pix e marca o item como boleto. */}
                  <div style={{ flex: 1, backgroundColor: '#fffbeb', padding: '15px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#d97706', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={lojasEnvolvidas.some(l => l.isBoleto)} disabled={dadosCompra.isFaltaGeral || dadosCompra.isCredito} onChange={(e) => {
                        setLojasEnvolvidas(lojasEnvolvidas.map(l => ({ ...l, isBoleto: e.target.checked })));
                      }} style={{ width: '20px', height: '20px' }} />
                      📄 BOLETO
                    </label>
                  </div>
                  {/* CRÉDITO: lança preço negativo para descontar valor que a loja tem a receber. */}
                  <div style={{ flex: 1, backgroundColor: dadosCompra.isCredito ? '#ecfdf5' : '#f8fafc', padding: '15px', borderRadius: '12px', border: dadosCompra.isCredito ? '1px solid #86efac' : '1px solid #e2e8f0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: dadosCompra.isCredito ? '#166534' : '#64748b', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={dadosCompra.isCredito} disabled={dadosCompra.isFaltaGeral} onChange={(e) => {
                        setDadosCompra({...dadosCompra, isCredito: e.target.checked});
                        if (e.target.checked) setLojasEnvolvidas(lojasEnvolvidas.map(l => ({ ...l, isBoleto: false })));
                      }} style={{ width: '20px', height: '20px' }} />
                      CRÉDITO
                    </label>
                  </div>
                  {/* FALTA: não compra o item e retira essa quantidade da cobrança. */}
                  <div style={{ flex: 1, backgroundColor: '#fef2f2', padding: '15px', borderRadius: '12px', border: '1px solid #fecaca' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={dadosCompra.isFaltaGeral} onChange={(e) => {
                        setDadosCompra({...dadosCompra, isFaltaGeral: e.target.checked, temBonificacao: false, isCredito: false});
                        if (e.target.checked) setLojasEnvolvidas(lojasEnvolvidas.map(l => ({...l, qtd_bonificada: 0})));
                      }} style={{ width: '20px', height: '20px' }} />
                      🚫 FALTA
                    </label>
                  </div>
                </>
              )}
            </div>

            {(abaModal === 'fracionado' || (abaModal === 'completo' && dadosCompra.temBonificacao)) && !dadosCompra.isFaltaGeral && (
                renderListaLojasModal()
            )}

            <button onClick={abaModal === 'completo' ? finalizarPedidoCompleto : finalizarPedidoFracionado} style={{ width: '100%', padding: '20px', backgroundColor: dadosCompra.isFaltaGeral ? '#ef4444' : '#111', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }}>
              FINALIZAR ITEM {abaModal === 'fracionado' ? 'FRACIONADO' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Modal de item manual: cria pedidos novos para lojas específicas. */}
      {modalAdicionarItem && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 11000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
              <div style={{ background: '#fff', width: '100%', maxWidth: '500px', borderRadius: '20px', padding: '20px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', color: '#111' }}>➕ Adicionar Item</h3>
                      <button onClick={() => setModalAdicionarItem(false)} style={{ background: '#eee', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
                  </div>

                  <div style={{ marginBottom: '15px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>PRODUTO:</label>
                      <input 
                          list="lista-produtos"
                          value={novoItemBusca}
                          onChange={e => setNovoItemBusca(e.target.value)}
                          placeholder="Digite ou selecione o produto..."
                          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', marginTop: '5px', textTransform: 'uppercase', fontWeight: 'bold', boxSizing: 'border-box' }}
                      />
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px', paddingRight: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginBottom: '10px', display: 'block' }}>DISTRIBUIÇÃO POR LOJA:</label>
                      {lojasBd.map(loja => (
                          <div key={loja.codigo_loja} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '5px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#334155' }}>{loja.nome_fantasia}</span>
                              <input 
                                  type="number" 
                                  step="any"
                                  min="0"
                                  placeholder="0"
                                  value={novoItemLojas[loja.codigo_loja] || ''}
                                  onChange={e => setNovoItemLojas({...novoItemLojas, [loja.codigo_loja]: e.target.value})}
                                  style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 'bold' }}
                              />
                          </div>
                      ))}
                  </div>

                  <button onClick={salvarNovoItemManual} style={{ width: '100%', padding: '15px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '14px' }}>
                      SALVAR PEDIDO
                  </button>
              </div>
          </div>
      )}

    </div>
  );
}
