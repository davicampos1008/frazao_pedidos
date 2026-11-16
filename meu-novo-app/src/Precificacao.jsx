import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

// 💡 FUNÇÃO INTELIGENTE DE BUSCA GLOBAL (Ignora acentos e espaços)
const normalizarParaBusca = (str) => {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '').toLowerCase();
};

// ============================================================================
// COMPONENTE: SCROLL HORIZONTAL COM O MOUSE
// ============================================================================
const MenuHorizontal = ({ children, style }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div ref={scrollRef} style={{ overflowX: 'auto', scrollbarWidth: 'none', ...style }}>
      {children}
    </div>
  );
};

// ============================================================================
// COMPONENTE: LINHA DO PRODUTO
// ============================================================================
const LinhaProduto = React.memo(({ produto, index, abrirModal, aoSalvar, corBorda, fornecedoresBd, modoSelecao, selecionado, aoSelecionar }) => {
  const [preco, setPreco] = useState(produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '');
  const [pesoCaixa, setPesoCaixa] = useState(produto.peso_caixa || '');
  const [fornecedor, setFornecedor] = useState(produto.fornecedor_nome || '');
  const [statusAviso, setStatusAviso] = useState('');
  
  const fornecedorRef = useRef(null);

  useEffect(() => {
    setPreco(produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '');
    setPesoCaixa(produto.peso_caixa || '');
    setFornecedor(produto.fornecedor_nome || '');
  }, [produto.preco, produto.peso_caixa, produto.fornecedor_nome]);

  const dispararAutoSave = async (pValor, pPesoCaixa, pFornecedor, acaoForcada = null) => {
    setStatusAviso('⏳');
    
    let v = String(pValor || '').replace(/[^\d,.]/g, '').trim();
    if (v.includes('.') && !v.includes(',')) v = v.replace('.', ','); 
    v = v.replace(/[^\d,]/g, ''); 
    
    let precoFinal = 'R$ 0,00';
    if (v) {
      let partes = v.split(',');
      let inteiro = partes[0] || '0';
      let decimal = partes[1] || '';
      
      if (decimal.length === 0) decimal = '00';
      else if (decimal.length === 1) decimal += '0';
      else decimal = decimal.substring(0, 2);
      
      precoFinal = `R$ ${inteiro},${decimal}`;
    }

    let statusCalculado = produto.status_cotacao;

    if (acaoForcada) {
      statusCalculado = acaoForcada;
    } else {
      if (precoFinal === 'R$ 0,00') {
        statusCalculado = 'pendente';
      } else {
        statusCalculado = 'ativo'; 
      }
    }

    // 💡 TRATAMENTO SEGURO DO FORNECEDOR PARA O BANCO (null se vazio)
    let fornFinal = (pFornecedor && pFornecedor.trim() !== '') ? pFornecedor.trim().toUpperCase() : null;
    if (fornFinal) {
        const limpo = normalizarParaBusca(fornFinal);
        const oficial = (fornecedoresBd || []).find(f => normalizarParaBusca(f.nome_fantasia) === limpo || normalizarParaBusca(f.nome_completo) === limpo);
        if (oficial) fornFinal = oficial.nome_fantasia.toUpperCase();
    }

    const payload = {
      preco: acaoForcada === 'sem_preco' || acaoForcada === 'falta' ? 'R$ 0,00' : precoFinal,
      peso_caixa: pPesoCaixa,
      fornecedor_nome: fornFinal,
      status_cotacao: statusCalculado
    };

    if (statusCalculado === 'ativo' || statusCalculado === 'mantido') {
      payload.preco_anterior = payload.preco;
    }

    // Salva na interface instantaneamente
    aoSalvar(produto.id, payload);

    // Salva no banco de dados silenciosamente
    const { error } = await supabase.from('produtos').update(payload).eq('id', produto.id);
    if (!error) {
      setStatusAviso('✅');
      setFornecedor(fornFinal || ''); 
      setTimeout(() => setStatusAviso(''), 2000);
    } else {
      setStatusAviso('❌');
      console.error("Erro Supabase:", error);
    }
  };

  // 💡 Lógica Síncrona Perfeita de Pulo
  const pularParaProximo = () => {
     const nextInput = document.getElementById(`preco-${index + 1}`);
     if (nextInput) {
         nextInput.focus();
         nextInput.select();
     } else {
         if (document.activeElement) document.activeElement.blur();
     }
  };

  const acaoRapida = (acao) => {
    if (acao === 'mantido') {
      const pAntigo = produto.preco_anterior && produto.preco_anterior !== 'R$ 0,00' ? produto.preco_anterior.replace('R$ ', '') : '';
      setPreco(pAntigo);
      dispararAutoSave(pAntigo, pesoCaixa, fornecedor, 'mantido');
      pularParaProximo();
    } else if (acao === 'sem_preco') {
      setPreco('');
      dispararAutoSave('', pesoCaixa, fornecedor, 'sem_preco');
      pularParaProximo();
    } else if (acao === 'falta') {
      setPreco('');
      dispararAutoSave('', pesoCaixa, fornecedor, 'falta');
      pularParaProximo();
    }
  };

  const matchPeso = String(pesoCaixa).match(/^([A-Z]+)\s+(.+)$/);
  const siglaMedidaVisual = matchPeso ? matchPeso[1] : 'CX';
  const pesoVisual = matchPeso ? matchPeso[2] : pesoCaixa;

  const iconeStatusCotacao = () => {
    switch(produto.status_cotacao) {
      case 'ativo': return '✅ Atualizado';
      case 'mantido': return '🔒 Mantido';
      case 'sem_preco': return '⏸️ S/ Preço';
      case 'falta': return '🚫 Falta';
      default: return '⏳ Pendente';
    }
  };

  return (
    <div style={{ backgroundColor: selecionado ? '#f5f3ff' : '#fff', borderRadius: '12px', padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: `5px solid ${corBorda}`, outline: selecionado ? '2px solid #8b5cf6' : 'none' }}>
      <div onClick={() => (modoSelecao ? aoSelecionar(produto.id) : abrirModal(produto))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '80%' }}>
          {modoSelecao && <input type="checkbox" checked={!!selecionado} readOnly style={{ width: '20px', height: '20px', accentColor: '#8b5cf6', pointerEvents: 'none', flexShrink: 0 }} />}
          <div style={{ width: '35px', height: '35px', borderRadius: '6px', backgroundImage: `url(${(produto.foto_url || '').split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f1f5f9' }} />
          <div style={{ overflow: 'hidden' }}>
            <strong style={{ display: 'block', fontSize: '14px', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{produto.nome}</strong>
            <div style={{ display: 'flex', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
              <span style={{fontSize: '9px', background: '#f1f5f9', color: '#64748b', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'}}>{produto.unidade_medida || 'UN'}</span>
              <span style={{fontSize: '9px', background: '#e2e8f0', color: '#475569', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'}}>{iconeStatusCotacao()}</span>
              {produto.promocao && <span style={{fontSize: '9px', background: '#fefce8', color: '#ca8a04', padding: '2px 6px', borderRadius: '4px', fontWeight: '900'}}>PROMO</span>}
              {produto.novidade && <span style={{fontSize: '9px', background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontWeight: '900'}}>NOVO</span>}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{statusAviso}</div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ position: 'relative', flex: 1.2 }}>
          <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}>R$</span>
          <input 
            id={`preco-${index}`}
            type="text" 
            value={preco} 
            onChange={e => setPreco(e.target.value)} 
            onKeyDown={e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.repeat) return; // Bloqueia pulo duplo se segurar a tecla sem querer

                    const valLimpo = preco.trim().toLowerCase();

                    // 1. Letra F -> Salva como falta e pula pro próximo
                    if (valLimpo === 'f') {
                        setPreco('');
                        dispararAutoSave('', pesoCaixa, fornecedor, 'falta');
                        pularParaProximo();
                        return;
                    }

                    // 2. Vazio -> Puxa o anterior, salva como mantido e pula pro próximo
                    if (!valLimpo) {
                        const pAntigo = produto.preco_anterior && produto.preco_anterior !== 'R$ 0,00' ? produto.preco_anterior.replace('R$ ', '') : '';
                        setPreco(pAntigo);
                        dispararAutoSave(pAntigo, pesoCaixa, fornecedor, 'mantido');
                        pularParaProximo();
                        return;
                    }

                    // 3. Preço Válido -> Vai para o Fornecedor (Sem salvar ainda)
                    if (fornecedorRef.current) {
                        fornecedorRef.current.focus();
                    }
                }
            }}
            placeholder={produto.preco_anterior && produto.preco_anterior !== 'R$ 0,00' ? produto.preco_anterior.replace('R$ ', '') : "0,00"}
            style={{ width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontWeight: '900', fontSize: '14px', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ position: 'relative', flex: 1.5 }}>
          <input 
            ref={fornecedorRef}
            list="lista-fornecedores"
            type="text"
            value={fornecedor}
            onChange={e => setFornecedor(e.target.value)}
            onKeyDown={e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.repeat) return;
                    
                    if (produto.unidade_medida === 'KG') {
                        const pesoInput = document.getElementById(`peso-${index}`);
                        if (pesoInput) {
                            pesoInput.focus();
                            return; // Se for KG, o enter final é no Peso
                        }
                    }
                    
                    // Salva e vai para o preço de baixo
                    dispararAutoSave(preco, pesoCaixa, fornecedor);
                    pularParaProximo();
                }
            }}
            placeholder="FORNECEDOR..."
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontWeight: 'bold', fontSize: '12px', backgroundColor: '#f8fafc', boxSizing: 'border-box', textTransform: 'uppercase' }}
          />
        </div>

        {produto.unidade_medida === 'KG' && (
          <div style={{ position: 'relative', width: '90px' }}>
            <input 
              id={`peso-${index}`}
              type="text" 
              value={pesoVisual} 
              onChange={e => setPesoCaixa(`${siglaMedidaVisual} ${e.target.value}`)} 
              onKeyDown={e => {
                  if (e.key === 'Enter') {
                      e.preventDefault();
                      if (e.repeat) return;

                      // Salva e vai para o preço de baixo
                      dispararAutoSave(preco, pesoCaixa, fornecedor); 
                      pularParaProximo();
                  }
              }}
              placeholder="Ex: 20"
              style={{ width: '100%', padding: '10px 30px 10px 10px', borderRadius: '8px', border: '1px solid #eab308', outline: 'none', fontWeight: 'bold', fontSize: '14px', backgroundColor: '#fefce8', boxSizing: 'border-box' }}
            />
            <span style={{ position: 'absolute', right: '10px', top: '10px', color: '#ca8a04', fontWeight: 'bold', fontSize: '11px' }}>Kg</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '5px', borderTop: '1px dashed #f1f5f9', paddingTop: '10px' }}>
        <button onClick={() => acaoRapida('mantido')} style={{ flex: 1, padding: '8px', background: '#fefce8', color: '#eab308', border: '1px solid #fef08a', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>🔒 MANTER</button>
        <button onClick={() => acaoRapida('sem_preco')} style={{ flex: 1, padding: '8px', background: '#fff7ed', color: '#f97316', border: '1px solid #fed7aa', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>⏸️ S/ PREÇO</button>
        <button onClick={() => acaoRapida('falta')} style={{ flex: 1, padding: '8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>🚫 FALTA</button>
      </div>

    </div>
  );
});


// ============================================================================
// TELA PRINCIPAL: PRECIFICACAO
// ============================================================================
export default function Precificacao() {
  const [produtos, setProdutos] = useState([]);
  const [fornecedoresBd, setFornecedoresBd] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState('todos'); 
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  
  const categoriasPossiveis = ['TODOS', 'Frutas', 'Verduras & Fungos', 'Legumes', 'Raízes, Tubérculos & Grãos', 'Bandejados', 'Avulsos', 'Folhagens', 'Caixaria', 'BRADISBA', 'POTY COCOS', 'MEGA', 'Outros'];
  const [categoriaFiltro, setCategoriaFiltro] = useState('TODOS');

  // Na aba PROMOÇÃO: quando ligado, mostra só os produtos já marcados como promoção.
  const [somenteMarcados, setSomenteMarcados] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [prodModal, setProdModal] = useState(null);
  
  const [formModal, setFormModal] = useState({ preco: '', fornecedor: '', status: 'pendente', promocao: false, novidade: false, fotos_novas: [], unidade: 'UN', peso_caixa: '', tipo_medida_kg: 'CX' });
  const [fazendoUpload, setFazendoUpload] = useState(false);

  const [configCardAberto, setConfigCardAberto] = useState(false);
  const [configuracoes, setConfiguracoes] = useState({ 
    nao_funciona: false, 
    is_feriado: false, 
    data_teste: '' 
  });
  const [testeAtivo, setTesteAtivo] = useState(false);

  // Salvando do modal: mostra só o botão "SALVANDO..." sem esconder a página inteira.
  const [salvandoModal, setSalvandoModal] = useState(false);

  // Seleção em lote (abas PENDENTES e PRONTOS).
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState([]);

  // Última ação em massa, guardada por 30 segundos para poder desfazer.
  const [desfazer, setDesfazer] = useState(null);
  const desfazerTimerRef = useRef(null);

  // Ao trocar de aba, sai do modo de seleção.
  useEffect(() => {
    setModoSelecao(false);
    setSelecionados([]);
  }, [abaAtiva]);

  // Limpa o temporizador do "desfazer" ao sair da tela.
  useEffect(() => {
    return () => { if (desfazerTimerRef.current) clearTimeout(desfazerTimerRef.current); };
  }, []);

  useEffect(() => { 
    carregarDados(); 
    carregarConfiguracoes();
    const radar = setInterval(() => {
      carregarDados(true);
    }, 10000);
    return () => clearInterval(radar);
  }, []);

  async function carregarConfiguracoes() {
    try {
      const { data, error } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      if (data && !error) {
        setConfiguracoes({
          nao_funciona: data.nao_funciona || false,
          is_feriado: data.is_feriado || false,
          data_teste: data.data_teste || ''
        });
        if (data.data_teste) setTesteAtivo(true);
      }
    } catch (e) { console.error(e); }
  }

  async function carregarDados(silencioso = false) {
    if (!silencioso) setCarregando(true);
    try {
      const { data: fornData } = await supabase.from('fornecedores').select('id, nome_fantasia, nome_completo').order('nome_fantasia', { ascending: true });
      if (fornData) setFornecedoresBd(fornData);

      const { data: prodData } = await supabase.from('produtos').select('*').eq('status', true).order('nome', { ascending: true });
      
      if (prodData) {
        const produtosProntos = prodData.map(p => {
          let novoStatus = p.status_cotacao;
          let novoPreco = p.preco;
          let atualizou = false;

          if (!novoStatus || String(novoStatus).trim() === '') {
              novoStatus = 'pendente';
              atualizou = true;
          }

          if (!novoPreco || novoPreco === '0' || String(novoPreco).trim() === '') {
            novoPreco = 'R$ 0,00';
            atualizou = true;
          }

          if (atualizou) {
            supabase.from('produtos').update({ status_cotacao: novoStatus, preco: novoPreco }).eq('id', p.id).then();
            return { ...p, status_cotacao: novoStatus, preco: novoPreco };
          }
          return p;
        });
        setProdutos(produtosProntos);
      }
    } catch (error) { console.error("Erro VIRTUS:", error); } 
    finally { if (!silencioso) setCarregando(false); }
  }

  const atualizarConfigBD = async (novosDados) => {
    try {
      await supabase.from('configuracoes').update(novosDados).eq('id', 1);
      setConfiguracoes(prev => ({ ...prev, ...novosDados }));
    } catch (e) { alert("Erro ao salvar configuração."); }
  };

  const aplicarTeste = async () => {
    if (!configuracoes.data_teste) return alert("Escolha uma data no calendário primeiro.");
    const partesData = configuracoes.data_teste.split('-'); 
    const dataSelecionada = new Date(partesData[0], partesData[1] - 1, partesData[2]); 
    const diaDaSemanaConvertido = dataSelecionada.getDay();

    await atualizarConfigBD({ data_teste: configuracoes.data_teste, dia_semana_teste: diaDaSemanaConvertido });
    setTesteAtivo(true);
    alert("Teste aplicado! O app do cliente agora vai usar este dia como regra.");
  };

  const finalizarTeste = async () => {
    await atualizarConfigBD({ data_teste: null, dia_semana_teste: null });
    setConfiguracoes(prev => ({ ...prev, data_teste: '' }));
    setTesteAtivo(false);
    alert("Teste finalizado. O sistema voltou ao dia de hoje.");
  };

  const isZerado = (preco) => !preco || preco === '0' || preco === '0,00' || String(preco).trim() === 'R$ 0,00' || String(preco).trim() === 'R$0,00';

  const listas = {
    todos: produtos, 
    pendentes: produtos.filter(p => !p.status_cotacao || p.status_cotacao === 'pendente'),
    prontos: produtos.filter(p => p.status_cotacao === 'ativo' && !isZerado(p.preco)),
    mantidos: produtos.filter(p => p.status_cotacao === 'mantido'),
    sem_preco: produtos.filter(p => p.status_cotacao === 'sem_preco'),
    falta: produtos.filter(p => p.status_cotacao === 'falta'),
    promocao: produtos.filter(p => p.promocao)
  };

  const qtdPendentes = listas.pendentes.length;

  const revisarItensOcultos = async () => {
    if(!window.confirm("Isso vai resgatar TODOS os produtos marcados como 🔴 VERMELHO e jogar de volta para ⏳ PENDENTES (R$ 0,00) para você cotar. Confirma?")) return;
    
    setCarregando(true);
    try {
      const itensEmFalta = produtos.filter(p => p.status_cotacao === 'vermelho');
      
      if (itensEmFalta.length === 0) {
          alert("✔️ Não há nenhum produto marcado como VERMELHO para revisar.");
          return;
      }

      let loteUpdates = itensEmFalta.map(p => ({
         id: p.id,
         status_cotacao: 'pendente',
         preco: 'R$ 0,00'
      }));

      for (let i = 0; i < loteUpdates.length; i += 50) {
        const lote = loteUpdates.slice(i, i + 50);
        await supabase.from('produtos').upsert(lote);
      }
      
      alert(`✅ REVISÃO CONCLUÍDA!\n${loteUpdates.length} produtos retornaram para PENDENTES.`);
      carregarDados();
      setAbaAtiva('pendentes');
    } catch (err) {
      alert("Erro na revisão: " + err.message);
    } finally {
      setCarregando(false);
    }
  };

  const zerarCotacao = async () => {
    if (!window.confirm("🚨 TEM CERTEZA?\nIsso vai apagar os preços atuais, promoções e novidades, mas manterá as FOTOS. Todos os itens irão para Pendentes.")) return;
    
    setCarregando(true);

    // Guarda o estado atual para poder desfazer.
    const snapshotAntes = produtos.map(p => ({ id: p.id, status_cotacao: p.status_cotacao, preco: p.preco, promocao: !!p.promocao, novidade: !!p.novidade }));
    let liberadosAntes = null;
    try {
      const { data: cfgAntes } = await supabase.from('configuracoes').select('precos_liberados').eq('id', 1).single();
      if (cfgAntes) liberadosAntes = cfgAntes.precos_liberados;
    } catch (e) { console.error(e); }

    await supabase.from('configuracoes').update({ precos_liberados: false }).eq('id', 1);

    const payloadGeral = produtos.map(p => {
      if (p.status_cotacao === 'mantido') {
        return { id: p.id, status_cotacao: 'pendente' };
      }
      return {
        id: p.id,
        status_cotacao: 'pendente',
        preco: 'R$ 0,00',
        promocao: false,
        novidade: false
      };
    });

    let deuErro = false;
    const tamanhoLote = 50;
    
    for (let i = 0; i < payloadGeral.length; i += tamanhoLote) {
      const lote = payloadGeral.slice(i, i + tamanhoLote);
      const { error } = await supabase.from('produtos').upsert(lote);
      if (error) {
        deuErro = true;
        alert("Erro na limpeza: " + error.message);
        break;
      }
    }

    if (!deuErro) {
      alert("✅ Cotação Zerada! A Loja foi fechada para os clientes (Preços Ocultos) e todos os itens foram para Pendentes.\n\nSe foi sem querer, use o botão DESFAZER que aparece na parte de baixo da tela."); 
      registrarDesfazer({ texto: 'Cotação zerada.', snapshot: snapshotAntes, precosLiberados: liberadosAntes });
      carregarDados(); 
      setAbaAtiva('pendentes');
    } else {
      setCarregando(false);
    }
  };

  const finalizarCotacao = async () => {
    if (qtdPendentes > 0) {
      if (!window.confirm(`⚠️ ATENÇÃO: Você ainda tem ${qtdPendentes} itens PENDENTES sem preço.\n\nTem certeza que deseja enviar os preços e ABRIR A LOJA para os clientes mesmo assim?`)) return;
    }
    
    setCarregando(true);
    const { error } = await supabase.from('configuracoes').update({ precos_liberados: true }).eq('id', 1);
    setCarregando(false);
    
    if (error) alert("Erro ao liberar loja.");
    else alert("🚀 LOJA ABERTA! Preços atualizados e disponíveis para os clientes instantaneamente.");
  };

  const handleAtualizarLista = (id, payload) => {
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
  };

  // 🔥 Marca ou desmarca um produto como promoção direto da aba PROMOÇÃO (salva na hora).
  const alternarPromocao = async (produto) => {
    const novoValor = !produto.promocao;
    handleAtualizarLista(produto.id, { promocao: novoValor });

    const { error } = await supabase.from('produtos').update({ promocao: novoValor }).eq('id', produto.id);
    if (error) {
      handleAtualizarLista(produto.id, { promocao: !novoValor });
      alert("Erro ao salvar a promoção: " + error.message);
    }
  };

  // 🧹 Remove a promoção de todos os produtos marcados.
  const limparPromocoes = async () => {
    const idsMarcados = produtos.filter(p => p.promocao).map(p => p.id);
    if (idsMarcados.length === 0) return;
    if (!window.confirm(`Remover a promoção de ${idsMarcados.length} produto(s)?`)) return;

    setProdutos(prev => prev.map(p => p.promocao ? { ...p, promocao: false } : p));
    const { error } = await supabase.from('produtos').update({ promocao: false }).in('id', idsMarcados);
    if (error) {
      alert("Erro ao limpar promoções: " + error.message);
      carregarDados(true);
    } else {
      registrarDesfazer({ texto: `Promoção removida de ${idsMarcados.length} produto(s).`, snapshot: idsMarcados.map(id => ({ id, promocao: true })) });
    }
  };

  // ↩ Guarda a última ação em massa por 30 segundos para poder desfazer.
  const registrarDesfazer = (info) => {
    if (desfazerTimerRef.current) clearTimeout(desfazerTimerRef.current);
    setDesfazer(info);
    desfazerTimerRef.current = setTimeout(() => setDesfazer(null), 30000);
  };

  const fecharDesfazer = () => {
    if (desfazerTimerRef.current) clearTimeout(desfazerTimerRef.current);
    setDesfazer(null);
  };

  // Restaura os valores que os produtos tinham antes da última ação em massa.
  const executarDesfazer = async () => {
    if (!desfazer) return;
    const info = desfazer;
    fecharDesfazer();

    const mapa = {};
    info.snapshot.forEach(item => { mapa[item.id] = item; });
    setProdutos(prev => prev.map(p => (mapa[p.id] ? { ...p, ...mapa[p.id] } : p)));

    let deuErro = false;
    for (let i = 0; i < info.snapshot.length; i += 25) {
      const lote = info.snapshot.slice(i, i + 25);
      const resultados = await Promise.all(lote.map(({ id, ...campos }) => supabase.from('produtos').update(campos).eq('id', id)));
      if (resultados.some(r => r.error)) deuErro = true;
    }

    if (info.precosLiberados !== undefined && info.precosLiberados !== null) {
      await supabase.from('configuracoes').update({ precos_liberados: info.precosLiberados }).eq('id', 1);
    }

    if (deuErro) alert("Alguns itens não puderam ser restaurados. Atualize a página e confira.");
    carregarDados(true);
  };

  // ☑️ Marca ou desmarca um produto na seleção em lote.
  const alternarSelecao = (id) => {
    setSelecionados(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  // ⚡ Aplica uma ação em todos os produtos selecionados.
  const aplicarEmLote = async (acao) => {
    const alvos = produtos.filter(p => selecionados.includes(p.id));
    if (alvos.length === 0) return;

    const nomesAcao = { mantido: '🔒 MANTER', sem_preco: '⏸️ S/ PREÇO', falta: '🚫 FALTA', promo_on: '🔥 marcar como PROMOÇÃO', promo_off: 'tirar da PROMOÇÃO' };
    if (!window.confirm(`Aplicar "${nomesAcao[acao]}" em ${alvos.length} produto(s)?`)) return;

    const atualizacoes = [];
    let ignorados = 0;

    alvos.forEach(p => {
      if (acao === 'mantido') {
        const anterior = p.preco_anterior && !isZerado(p.preco_anterior) ? p.preco_anterior : null;
        if (!anterior) { ignorados++; return; }
        atualizacoes.push({ id: p.id, campos: { status_cotacao: 'mantido', preco: anterior, preco_anterior: anterior } });
      } else if (acao === 'sem_preco' || acao === 'falta') {
        atualizacoes.push({ id: p.id, campos: { status_cotacao: acao, preco: 'R$ 0,00' } });
      } else {
        atualizacoes.push({ id: p.id, campos: { promocao: acao === 'promo_on' } });
      }
    });

    if (atualizacoes.length === 0) {
      alert("Nenhum dos produtos selecionados tem preço anterior para manter.");
      return;
    }

    const mapa = {};
    atualizacoes.forEach(a => { mapa[a.id] = a.campos; });

    // Guarda o estado atual só dos produtos que serão alterados.
    const snapshot = alvos.filter(p => mapa[p.id]).map(p => ({
      id: p.id,
      status_cotacao: p.status_cotacao,
      preco: p.preco,
      preco_anterior: p.preco_anterior === undefined ? null : p.preco_anterior,
      promocao: !!p.promocao
    }));

    setProdutos(prev => prev.map(p => (mapa[p.id] ? { ...p, ...mapa[p.id] } : p)));

    let deuErro = false;
    if (acao === 'mantido') {
      for (let i = 0; i < atualizacoes.length; i += 25) {
        const lote = atualizacoes.slice(i, i + 25);
        const resultados = await Promise.all(lote.map(a => supabase.from('produtos').update(a.campos).eq('id', a.id)));
        if (resultados.some(r => r.error)) deuErro = true;
      }
    } else {
      const ids = atualizacoes.map(a => a.id);
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from('produtos').update(atualizacoes[0].campos).in('id', ids.slice(i, i + 100));
        if (error) deuErro = true;
      }
    }

    if (deuErro) {
      alert("Erro ao aplicar a ação em alguns produtos. Os dados foram recarregados, confira a lista.");
      carregarDados(true);
      return;
    }

    registrarDesfazer({ texto: `${nomesAcao[acao]} aplicado em ${atualizacoes.length} produto(s).`, snapshot });
    setModoSelecao(false);
    setSelecionados([]);

    if (ignorados > 0) alert(`${ignorados} produto(s) ficaram de fora porque não têm preço anterior para manter.`);
    if (acao === 'promo_on') {
      const semFoto = alvos.filter(p => !(p.foto_url && String(p.foto_url).split(',').some(f => f.trim()))).length;
      if (semFoto > 0) alert(`Atenção: ${semFoto} produto(s) em promoção estão sem foto.`);
    }
  };

  const abrirEdicaoCompleta = (produto) => {
    setProdModal(produto);

    let pesoPuro = produto.peso_caixa || '';
    let tipoMedida = 'CX';

    const matchPeso = String(pesoPuro).match(/^([A-Z]+)\s+(.+)$/);
    if (matchPeso) {
        tipoMedida = matchPeso[1];
        pesoPuro = matchPeso[2];
    }

    setFormModal({
      preco: produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '',
      fornecedor: produto.fornecedor_nome || '', 
      status: produto.status_cotacao || 'pendente',
      promocao: produto.promocao || false,
      novidade: produto.novidade || false,
      fotos_novas: [],
      unidade: produto.unidade_medida || 'UN',
      peso_caixa: pesoPuro,
      tipo_medida_kg: tipoMedida 
    });
    setModalAberto(true);
  };

  const processarArquivosFotos = async (files) => {
    if (!files || !files.length) return;
    setFazendoUpload(true);
    const urlsSalvas = [];
    for (const file of files) {
      const fileName = `prod_${prodModal.id}_${Date.now()}_${Math.floor(Math.random()*1000)}.jpg`;
      const { error } = await supabase.storage.from('frazao-midia').upload(`produtos/${fileName}`, file);
      if (!error) {
        const { data } = supabase.storage.from('frazao-midia').getPublicUrl(`produtos/${fileName}`);
        urlsSalvas.push(data.publicUrl);
      }
    }
    setFormModal(prev => ({ ...prev, fotos_novas: [...prev.fotos_novas, ...urlsSalvas] }));
    setFazendoUpload(false);
  };

  const handleUploadFotos = async (event) => {
    const files = Array.from(event.target.files);
    await processarArquivosFotos(files);
  };

  const handleColarFoto = async (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        files.push(items[i].getAsFile());
      }
    }
    if (files.length > 0) {
      event.preventDefault(); 
      await processarArquivosFotos(files);
    }
  };

  const removerFoto = (index) => {
    const arrAntigo = prodModal.foto_url ? String(prodModal.foto_url).split(',') : [];
    const arrNovo = formModal.fotos_novas;
    
    if (index < arrAntigo.length) {
      arrAntigo.splice(index, 1);
      setProdModal({ ...prodModal, foto_url: arrAntigo.join(',') });
    } else {
      arrNovo.splice(index - arrAntigo.length, 1);
      setFormModal({ ...formModal, fotos_novas: arrNovo });
    }
  };

  const salvarModal = async () => {
    if (salvandoModal) return;
    let v = String(formModal.preco || '').replace(/\./g, ',').replace(/[^\d,]/g, '').trim();
    let precoFinal = 'R$ 0,00';
    if (v) {
      let partes = v.split(',');
      let int = partes[0] || '0';
      let dec = partes[1] || '';
      if (dec.length === 0) dec = '00';
      else if (dec.length === 1) dec += '0';
      else dec = dec.substring(0, 2);
      precoFinal = `R$ ${int},${dec}`;
    }

    if (formModal.status === 'falta' || formModal.status === 'sem_preco') precoFinal = 'R$ 0,00';

    let statusCalc = formModal.status;
    if (statusCalc === 'pendente' && precoFinal !== 'R$ 0,00') statusCalc = 'ativo';

    let pesoCaixaFinal = formModal.peso_caixa;
    if (formModal.unidade === 'KG' && formModal.peso_caixa) {
        pesoCaixaFinal = `${formModal.tipo_medida_kg} ${formModal.peso_caixa}`;
    }

    let fornFinalModal = (formModal.fornecedor && formModal.fornecedor.trim() !== '') ? formModal.fornecedor.trim().toUpperCase() : null;
    if (fornFinalModal) {
        const strBusca = normalizarParaBusca(fornFinalModal);
        const oficial = fornecedoresBd.find(f => normalizarParaBusca(f.nome_fantasia) === strBusca || normalizarParaBusca(f.nome_completo) === strBusca);
        if (oficial) fornFinalModal = oficial.nome_fantasia.toUpperCase();
    }

    const fotosAtuais = prodModal.foto_url ? String(prodModal.foto_url).split(',') : [];
    const payload = {
      preco: precoFinal,
      peso_caixa: pesoCaixaFinal, 
      fornecedor_nome: fornFinalModal,
      status_cotacao: statusCalc,
      promocao: formModal.promocao,
      novidade: formModal.novidade,
      unidade_medida: formModal.unidade,
      foto_url: [...fotosAtuais, ...formModal.fotos_novas].filter(f=>f).join(',')
    };

    if (statusCalc === 'ativo' || statusCalc === 'mantido') {
      payload.preco_anterior = payload.preco;
    }

    setSalvandoModal(true);
    const { error } = await supabase.from('produtos').update(payload).eq('id', prodModal.id);
    
    if (error) {
      alert("Erro Supabase: " + error.message);
    } else {
      handleAtualizarLista(prodModal.id, payload);
    }
    
    setSalvandoModal(false);
    setModalAberto(false);
  };

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando Sistema...</div>;

  const CONFIG_ABAS = [
    { id: 'todos', nomeStr: 'TODOS', cor: '#8b5cf6', icone: '📋', itens: listas.todos },
    { id: 'pendentes', nomeStr: 'PENDENTES', cor: '#3b82f6', icone: '⏳', itens: listas.pendentes },
    { id: 'prontos', nomeStr: 'PRONTOS', cor: '#22c55e', icone: '✅', itens: listas.prontos },
    { id: 'mantidos', nomeStr: 'MANTIDOS', cor: '#eab308', icone: '🔒', itens: listas.mantidos },
    { id: 'sem_preco', nomeStr: 'S/ PREÇO', cor: '#f97316', icone: '⏸️', itens: listas.sem_preco },
    { id: 'falta', nomeStr: 'FALTA', cor: '#ef4444', icone: '🚫', itens: listas.falta },
    { id: 'promocao', nomeStr: 'PROMOÇÃO', cor: '#ec4899', icone: '🔥', itens: listas.promocao },
  ];

  // Na aba PROMOÇÃO a lista base são TODOS os produtos, para poder pesquisar e marcar qualquer um.
  const listaDaAbaAtual = abaAtiva === 'promocao' ? produtos : (listas[abaAtiva] || []);
  const abaPermiteSelecao = abaAtiva === 'pendentes' || abaAtiva === 'prontos';
  
  const produtosRenderizados = listaDaAbaAtual.filter(p => {
      const termoBusca = normalizarParaBusca(busca);
      const nomeProduto = normalizarParaBusca(p.nome);
      
      const bateuBusca = nomeProduto.includes(termoBusca);

      if (abaAtiva === 'promocao' && somenteMarcados && !p.promocao) return false;
      
      if (categoriaFiltro === 'TODOS') return bateuBusca;
      return bateuBusca && (p.categoria === categoriaFiltro);
  });

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '120px', padding: '10px' }}>
      
      <datalist id="lista-fornecedores">
        {fornecedoresBd.map(f => {
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

      {/* 🎛️ HEADER DE COMANDO */}
      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900' }}>💲 PRECIFICAÇÃO</h2>
            <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>Faltam <strong style={{color: '#ef4444', fontSize: '16px'}}>{qtdPendentes}</strong> itens.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={() => setConfigCardAberto(!configCardAberto)} style={{ background: '#333', border: 'none', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontSize: '20px' }}>⚙️</button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={revisarItensOcultos} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(59,130,246,0.3)' }}>
                🔄 RESGATAR FALTAS
              </button>
              <button onClick={zerarCotacao} style={{ background: '#333', color: '#ef4444', border: 'none', padding: '10px 15px', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>
                🗑️ ZERAR COTAÇÃO
              </button>
            </div>
          </div>
        </div>

        {/* Card de Configurações Acoplado */}
        {configCardAberto && (
          <div style={{ background: '#222', padding: '20px', borderRadius: '15px', border: '1px solid #444', display: 'flex', flexDirection: 'column', gap: '15px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button onClick={() => atualizarConfigBD({ nao_funciona: !configuracoes.nao_funciona })} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: configuracoes.nao_funciona ? '#ef4444' : '#22c55e', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
                  {configuracoes.nao_funciona ? '🚫 LOJA FECHADA' : '✅ LOJA ABERTA'}
                </button>
                <button onClick={() => atualizarConfigBD({ is_feriado: !configuracoes.is_feriado })} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: configuracoes.is_feriado ? '#eab308' : '#3b82f6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
                  {configuracoes.is_feriado ? '🚩 É FERIADO' : '🏳️ DIA NORMAL'}
                </button>
             </div>
             <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#333', padding: '10px', borderRadius: '10px' }}>
                <input type="date" value={configuracoes.data_teste} onChange={(e) => setConfiguracoes({...configuracoes, data_teste: e.target.value})} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#444', color: '#fff', outline: 'none' }} />
                {!testeAtivo ? (
                  <button onClick={aplicarTeste} style={{ padding: '10px 15px', background: '#eab308', color: '#111', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>TESTAR DATA</button>
                ) : (
                  <button onClick={finalizarTeste} style={{ padding: '10px 15px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>PARAR TESTE</button>
                )}
             </div>
          </div>
        )}

        <button onClick={finalizarCotacao} style={{ width: '100%', backgroundColor: '#22c55e', color: 'white', border: 'none', padding: '18px', borderRadius: '16px', fontWeight: '900', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(34,197,94,0.3)' }}>
          🚀 FINALIZAR COTAÇÃO E ABRIR LOJA
        </button>

      </div>

      {/* 📑 ABAS DE STATUS - SCROLL COM O MOUSE HABILITADO */}
      <MenuHorizontal style={{ display: 'flex', gap: '5px', marginBottom: '15px', paddingBottom: '5px' }}>
        {CONFIG_ABAS.map(aba => (
          <button 
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)} 
            style={{ 
              flexShrink: 0, padding: '12px 15px', borderRadius: '12px', border: 'none', 
              fontWeight: '900', fontSize: '11px', cursor: 'pointer', 
              backgroundColor: abaAtiva === aba.id ? aba.cor : '#fff', 
              color: abaAtiva === aba.id ? '#fff' : '#64748b',
              boxShadow: abaAtiva === aba.id ? `0 4px 10px ${aba.cor}50` : 'none'
            }}
          >
            {aba.icone} {aba.nomeStr} ({aba.itens.length})
          </button>
        ))}
      </MenuHorizontal>

      {/* 💡 BARRA ROLÁVEL DE CATEGORIAS - SCROLL COM O MOUSE HABILITADO */}
      <MenuHorizontal style={{ display: 'flex', gap: '10px', paddingBottom: '15px', marginBottom: '10px' }}>
         {categoriasPossiveis.map(cat => (
            <button 
               key={cat} 
               onClick={() => setCategoriaFiltro(cat)} 
               style={{ 
                  padding: '8px 16px', 
                  borderRadius: '20px', 
                  border: 'none', 
                  backgroundColor: categoriaFiltro === cat ? '#111' : '#e2e8f0', 
                  color: categoriaFiltro === cat ? '#fff' : '#475569', 
                  fontWeight: 'bold', 
                  fontSize: '11px', 
                  cursor: 'pointer', 
                  whiteSpace: 'nowrap' 
               }}
            >
               {cat}
            </button>
         ))}
      </MenuHorizontal>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '12px', display: 'flex', gap: '10px', marginBottom: '15px', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
        <span>🔍</span><input placeholder="Buscar item..." value={busca} onChange={e => setBusca(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
      </div>

      {/* 🔥 ABA PROMOÇÃO: lista todos os produtos para marcar/desmarcar o destaque, já mostrando o preço */}
      {abaAtiva === 'promocao' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

          <div style={{ backgroundColor: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '12px', padding: '12px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <strong style={{ fontSize: '14px', color: '#be185d', display: 'block' }}>🔥 {listas.promocao.length} produto(s) em promoção</strong>
              <span style={{ fontSize: '11px', color: '#9d174d' }}>Clique no produto para marcar ou desmarcar. Salva na hora.</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setSomenteMarcados(!somenteMarcados)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: somenteMarcados ? '2px solid #ec4899' : '1px solid #f9a8d4', background: somenteMarcados ? '#ec4899' : '#fff', color: somenteMarcados ? '#fff' : '#be185d', fontWeight: '900', fontSize: '10px', cursor: 'pointer' }}
              >
                {somenteMarcados ? '👁️ MOSTRANDO SÓ MARCADOS' : '👁️ VER SÓ MARCADOS'}
              </button>
              <button
                onClick={limparPromocoes}
                disabled={listas.promocao.length === 0}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontWeight: '900', fontSize: '10px', cursor: listas.promocao.length === 0 ? 'not-allowed' : 'pointer', opacity: listas.promocao.length === 0 ? 0.5 : 1 }}
              >
                🧹 LIMPAR TODAS
              </button>
            </div>
          </div>

          {produtosRenderizados.map(p => {
            const marcado = !!p.promocao;
            const semPreco = isZerado(p.preco);
            const temFoto = !!(p.foto_url && String(p.foto_url).split(',').filter(f => f.trim()).length > 0);
            const mostrarAnterior = p.preco_anterior && !isZerado(p.preco_anterior) && p.preco_anterior !== p.preco;

            return (
              <div
                key={p.id}
                onClick={() => alternarPromocao(p)}
                style={{ backgroundColor: marcado ? '#fef9c3' : '#fff', borderRadius: '12px', padding: '12px 15px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: marcado ? '2px solid #f59e0b' : '2px solid transparent', transition: '0.15s' }}
              >
                <input type="checkbox" checked={marcado} readOnly style={{ width: '20px', height: '20px', accentColor: '#ec4899', pointerEvents: 'none', flexShrink: 0 }} />

                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundImage: `url(${(p.foto_url || '').split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f1f5f9', flexShrink: 0 }} />

                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <strong style={{ display: 'block', fontSize: '14px', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</strong>
                  <div style={{ display: 'flex', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '9px', background: '#f1f5f9', color: '#64748b', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>{p.unidade_medida || 'UN'}</span>
                    {p.categoria && <span style={{ fontSize: '9px', background: '#e2e8f0', color: '#475569', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>{p.categoria}</span>}
                    {p.status_cotacao === 'falta' && <span style={{ fontSize: '9px', background: '#fef2f2', color: '#ef4444', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold' }}>🚫 Falta</span>}
                    {marcado && !temFoto && <span style={{ fontSize: '9px', background: '#fff7ed', color: '#ea580c', padding: '2px 4px', borderRadius: '4px', fontWeight: '900' }}>📷 SEM FOTO</span>}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {semPreco ? (
                    <span style={{ fontSize: '11px', fontWeight: '900', color: '#ef4444', background: '#fef2f2', padding: '4px 8px', borderRadius: '6px' }}>SEM PREÇO</span>
                  ) : (
                    <strong style={{ fontSize: '16px', color: '#16a34a' }}>{p.preco}</strong>
                  )}
                  {mostrarAnterior && (
                    <span style={{ display: 'block', fontSize: '10px', color: '#94a3b8', textDecoration: 'line-through', marginTop: '2px' }}>{p.preco_anterior}</span>
                  )}
                </div>
              </div>
            );
          })}

          {produtosRenderizados.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '16px' }}>Nenhum item atende aos filtros atuais.</div>
          )}
        </div>
      ) : (
        <>
          {/* ☑️ BARRA DE SELEÇÃO EM LOTE (PENDENTES e PRONTOS) */}
          {abaPermiteSelecao && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
              <button
                onClick={() => { setModoSelecao(!modoSelecao); setSelecionados([]); }}
                style={{ padding: '10px 14px', borderRadius: '10px', border: modoSelecao ? '2px solid #8b5cf6' : '1px solid #cbd5e1', background: modoSelecao ? '#8b5cf6' : '#fff', color: modoSelecao ? '#fff' : '#475569', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}
              >
                {modoSelecao ? '✖ SAIR DA SELEÇÃO' : '☑️ SELECIONAR VÁRIOS'}
              </button>
              {modoSelecao && (
                <>
                  <button
                    onClick={() => setSelecionados(prev => Array.from(new Set([...prev, ...produtosRenderizados.map(p => p.id)])))}
                    style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#6d28d9', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}
                  >
                    ☑️ TODOS OS FILTRADOS ({produtosRenderizados.length})
                  </button>
                  <button
                    onClick={() => setSelecionados([])}
                    style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}
                  >
                    LIMPAR
                  </button>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#6d28d9' }}>{selecionados.length} selecionado(s)</span>
                </>
              )}
            </div>
          )}

          {/* 📝 LISTA RENDERIZADA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {produtosRenderizados.map((p, index) => (
               <LinhaProduto 
                 key={p.id} 
                 index={index}
                 produto={p} 
                 corBorda={CONFIG_ABAS.find(a => a.id === p.status_cotacao)?.cor || '#3b82f6'}
                 abrirModal={abrirEdicaoCompleta} 
                 aoSalvar={handleAtualizarLista}
                 modoSelecao={modoSelecao}
                 selecionado={selecionados.includes(p.id)}
                 aoSelecionar={alternarSelecao}
                 fornecedoresBd={fornecedoresBd} 
               />
            ))}
            {produtosRenderizados.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '16px' }}>Nenhum item atende aos filtros atuais.</div>
            )}
          </div>
        </>
      )}

      {/* ⚡ BARRA DE AÇÕES DA SELEÇÃO EM LOTE */}
      {modoSelecao && abaPermiteSelecao && selecionados.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', backgroundColor: '#fff', padding: '14px 16px', boxShadow: '0 -10px 30px rgba(0,0,0,0.12)', zIndex: 9000, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <strong style={{ fontSize: '13px', color: '#6d28d9' }}>{selecionados.length} produto(s) selecionado(s)</strong>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => aplicarEmLote('mantido')} style={{ flex: 1, minWidth: '90px', padding: '12px 8px', background: '#fefce8', color: '#ca8a04', border: '1px solid #fef08a', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>🔒 MANTER</button>
            <button onClick={() => aplicarEmLote('sem_preco')} style={{ flex: 1, minWidth: '90px', padding: '12px 8px', background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>⏸️ S/ PREÇO</button>
            <button onClick={() => aplicarEmLote('falta')} style={{ flex: 1, minWidth: '90px', padding: '12px 8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>🚫 FALTA</button>
            <button onClick={() => aplicarEmLote('promo_on')} style={{ flex: 1, minWidth: '90px', padding: '12px 8px', background: '#fdf2f8', color: '#be185d', border: '1px solid #fbcfe8', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>🔥 PROMOÇÃO</button>
            <button onClick={() => aplicarEmLote('promo_off')} style={{ flex: 1, minWidth: '90px', padding: '12px 8px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>❌ TIRAR PROMO</button>
          </div>
        </div>
      )}

      {/* ↩ AVISO PARA DESFAZER A ÚLTIMA AÇÃO EM MASSA */}
      {desfazer && (
        <div style={{ position: 'fixed', bottom: modoSelecao && selecionados.length > 0 ? '130px' : '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 9500, backgroundColor: '#111', color: '#fff', padding: '12px 16px', borderRadius: '14px', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '92%', boxSizing: 'border-box' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{desfazer.texto}</span>
          <button onClick={executarDesfazer} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: '900', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>↩ DESFAZER</button>
          <button onClick={fecharDesfazer} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 🛠️ MODAL DE EDIÇÃO COMPLETA */}
      {modalAberto && prodModal && (
        <div onPaste={handleColarFoto} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', padding: '0' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '600px', borderRadius: '30px 30px 0 0', padding: '30px 25px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>✏️ Edição Completa</h3>
              <button onClick={() => setModalAberto(false)} style={{ background: '#f1f5f9', border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>

            <strong style={{ fontSize: '16px', color: '#111', marginBottom: '20px', display: 'block' }}>{prodModal.nome}</strong>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '25px' }}>
              <button onClick={() => {
                const pAntigo = prodModal.preco_anterior ? prodModal.preco_anterior.replace('R$ ', '') : '';
                setFormModal({...formModal, status: 'mantido', preco: pAntigo});
              }} style={{ padding: '10px', borderRadius: '10px', border: formModal.status === 'mantido' ? '2px solid #eab308' : '1px solid #e2e8f0', background: formModal.status === 'mantido' ? '#fefce8' : '#fff', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer', color: formModal.status === 'mantido' ? '#ca8a04' : '#666' }}>
                🔒 MANTER
              </button>
              <button onClick={() => setFormModal({...formModal, status: 'sem_preco', preco: ''})} style={{ padding: '10px', borderRadius: '10px', border: formModal.status === 'sem_preco' ? '2px solid #f97316' : '1px solid #e2e8f0', background: formModal.status === 'sem_preco' ? '#fff7ed' : '#fff', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer', color: formModal.status === 'sem_preco' ? '#ea580c' : '#666' }}>
                ⏸️ S/ PREÇO
              </button>
              <button onClick={() => setFormModal({...formModal, status: 'falta', preco: ''})} style={{ padding: '10px', borderRadius: '10px', border: formModal.status === 'falta' ? '2px solid #ef4444' : '1px solid #e2e8f0', background: formModal.status === 'falta' ? '#fef2f2' : '#fff', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer', color: formModal.status === 'falta' ? '#ef4444' : '#666' }}>
                🚫 FALTA
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px', marginBottom: '15px' }}>
              <div>
                <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>VENDA (R$)</label>
                <input 
                  type="text" value={formModal.preco} 
                  placeholder={prodModal.preco_anterior ? prodModal.preco_anterior.replace('R$ ', '') : "0,00"}
                  onChange={e => setFormModal({...formModal, preco: e.target.value, status: 'ativo'})} 
                  disabled={formModal.status === 'falta' || formModal.status === 'sem_preco'}
                  style={{ width: '100%', padding: '15px', borderRadius: '10px', border: '2px solid #f1f5f9', outline: 'none', fontSize: '16px', fontWeight: '900', boxSizing: 'border-box' }} 
                />
              </div>
              
              <div>
                <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>FORNECEDOR</label>
                <input 
                  list="lista-fornecedores"
                  type="text" 
                  value={formModal.fornecedor} 
                  onChange={e => setFormModal({...formModal, fornecedor: e.target.value})} 
                  placeholder="EX: CEASA..."
                  style={{ width: '100%', padding: '15px', borderRadius: '10px', border: '2px solid #f1f5f9', outline: 'none', fontSize: '12px', fontWeight: 'bold', boxSizing: 'border-box', textTransform: 'uppercase' }} 
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: '80px' }}>
                <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>MEDIDA</label>
                <select 
                  value={formModal.unidade} 
                  onChange={e => setFormModal({...formModal, unidade: e.target.value})}
                  style={{ width: '100%', padding: '15px 5px', borderRadius: '10px', border: '2px solid #f1f5f9', outline: 'none', fontSize: '14px', fontWeight: 'bold', boxSizing: 'border-box', backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <option value="UN">UN</option>
                  <option value="KG">KG</option>
                  <option value="CX">CX</option>
                  <option value="PCT">PCT</option>
                  <option value="DZ">DZ</option>
                  <option value="MAÇO">MAÇO</option>
                  <option value="BDJ">BDJ</option>
                  <option value="SACO">SACO</option>
                </select>
              </div>

              {formModal.unidade === 'KG' && (
                <div style={{ display: 'flex', gap: '5px' }}>
                  <div style={{ width: '70px' }}>
                     <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>TIPO</label>
                     <select 
                        value={formModal.tipo_medida_kg} 
                        onChange={e => setFormModal({...formModal, tipo_medida_kg: e.target.value})}
                        disabled={formModal.status === 'falta' || formModal.status === 'sem_preco'}
                        style={{ width: '100%', padding: '15px 5px', borderRadius: '10px', border: '2px solid #fef08a', background: '#fefce8', color: '#ca8a04', outline: 'none', fontSize: '12px', fontWeight: 'bold', boxSizing: 'border-box', cursor: 'pointer' }}
                     >
                        <option value="CX">CX</option>
                        <option value="SC">SC</option>
                        <option value="PCT">PCT</option>
                        <option value="BDJ">BDJ</option>
                        <option value="MÇ">MÇ</option>
                     </select>
                  </div>
                  
                  <div style={{ width: '80px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>PESO (Kg)</label>
                    <input 
                      type="text" value={formModal.peso_caixa} 
                      placeholder="Ex: 20"
                      onChange={e => setFormModal({...formModal, peso_caixa: e.target.value})} 
                      disabled={formModal.status === 'falta' || formModal.status === 'sem_preco'}
                      style={{ width: '100%', padding: '15px 10px', borderRadius: '10px', border: '2px solid #fef08a', background: '#fefce8', color: '#ca8a04', outline: 'none', fontSize: '14px', fontWeight: 'bold', boxSizing: 'border-box' }} 
                    />
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', backgroundColor: '#f8fafc', padding: '15px', borderRadius: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={formModal.promocao} onChange={e => setFormModal({...formModal, promocao: e.target.checked})} style={{ width: '18px', height: '18px' }} />🔥 Promoção
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={formModal.novidade} onChange={e => setFormModal({...formModal, novidade: e.target.checked})} style={{ width: '18px', height: '18px' }} />✨ Novidade
              </label>
            </div>

            <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '10px' }}>FOTOS (Obrigatório para Promoção ou Novidade)</label>
            
            {/* 💡 GALERIA DE FOTOS - SCROLL COM O MOUSE HABILITADO */}
            <MenuHorizontal style={{ display: 'flex', gap: '10px', paddingBottom: '10px' }}>
              <label style={{ minWidth: '90px', height: '70px', borderRadius: '10px', border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: '#f8fafc', textAlign: 'center', padding: '5px' }}>
                <span style={{ fontSize: '20px', marginBottom: '2px' }}>{fazendoUpload ? '⏳' : '📸'}</span>
                {!fazendoUpload && <span style={{ fontSize: '8px', color: '#64748b', fontWeight: 'bold' }}>Galeria ou<br/>Ctrl+V</span>}
                <input type="file" multiple accept="image/*" onChange={handleUploadFotos} style={{ display: 'none' }} disabled={fazendoUpload} />
              </label>
              {[...(prodModal.foto_url ? String(prodModal.foto_url).split(',') : []), ...formModal.fotos_novas].filter(f=>f).map((url, i) => (
                <div key={i} style={{ minWidth: '70px', height: '70px', borderRadius: '10px', backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                  <button onClick={() => removerFoto(i)} style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: 'white', border: 'none', width: '20px', height: '20px', borderRadius: '50%', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </MenuHorizontal>

            <button onClick={salvarModal} disabled={salvandoModal} style={{ width: '100%', padding: '20px', opacity: salvandoModal ? 0.6 : 1, backgroundColor: '#111', color: 'white', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '16px', marginTop: '10px', cursor: 'pointer' }}>
              {salvandoModal ? '⏳ SALVANDO...' : '💾 SALVAR E FECHAR'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}