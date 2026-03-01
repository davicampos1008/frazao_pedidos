import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// ============================================================================
// COMPONENTE: LINHA DO PRODUTO (Auto-Save e Memória Automática)
// ============================================================================
const LinhaProduto = ({ produto, abrirModal, aoSalvar, corBorda }) => {
  const [preco, setPreco] = useState(produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '');
  const [fornecedor, setFornecedor] = useState(produto.fornecedor || '');
  const [statusAviso, setStatusAviso] = useState('');

  useEffect(() => {
    setPreco(produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '');
    setFornecedor(produto.fornecedor || '');
  }, [produto.preco, produto.fornecedor]);

  const dispararAutoSave = async (pValor, fValor, acaoForcada = null) => {
    setStatusAviso('⏳');
    
    // 💡 FORMATADOR INTELIGENTE DE MOEDA (Sempre X,XX)
    let v = String(pValor || '').replace(/[^\d,.]/g, '').trim();
    if (v.includes('.') && !v.includes(',')) v = v.replace('.', ','); // Aceita se digitar com ponto
    v = v.replace(/[^\d,]/g, ''); // Limpa tudo que não for número e vírgula
    
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

    const fornFinal = String(fValor || '').trim().toUpperCase();
    let statusCalculado = produto.status_cotacao;

    // Lógica inteligente de status
    if (acaoForcada) {
      statusCalculado = acaoForcada;
    } else {
      if (precoFinal === 'R$ 0,00' || !fornFinal) {
        statusCalculado = 'pendente';
      } else {
        statusCalculado = 'ativo'; // Tem preço e fornecedor = Pronto!
      }
    }

    const payload = {
      preco: acaoForcada === 'sem_preco' || acaoForcada === 'falta' ? 'R$ 0,00' : precoFinal,
      fornecedor: acaoForcada === 'sem_preco' || acaoForcada === 'falta' ? '' : fornFinal,
      status_cotacao: statusCalculado
    };

    // 💡 MEMÓRIA AUTOMÁTICA: Salva no "Anterior" se for Ativo ou Mantido
    if (statusCalculado === 'ativo' || statusCalculado === 'mantido') {
      payload.preco_anterior = payload.preco;
      payload.fornecedor_anterior = payload.fornecedor;
    }

    // 1º Atualiza a UI mãe na hora (isso fará o input ser atualizado com o valor formatado bonitinho)
    aoSalvar(produto.id, payload);

    // 2º Bate no banco de dados
    const { error } = await supabase.from('produtos').update(payload).eq('id', produto.id);
    if (!error) {
      setStatusAviso('✅');
      setTimeout(() => setStatusAviso(''), 2000);
    } else {
      setStatusAviso('❌');
      console.error(error);
    }
  };

  const handleBlur = () => {
    dispararAutoSave(preco, fornecedor);
  };

  const acaoRapida = (acao) => {
    if (acao === 'mantido') {
      const pAntigo = produto.preco_anterior && produto.preco_anterior !== 'R$ 0,00' ? produto.preco_anterior.replace('R$ ', '') : '';
      const fAntigo = produto.fornecedor_anterior || '';
      if (!fAntigo) return alert("⚠️ Sem fornecedor antigo na memória. Insira manualmente.");
      setPreco(pAntigo);
      setFornecedor(fAntigo);
      dispararAutoSave(pAntigo, fAntigo, 'mantido');
    } else if (acao === 'sem_preco') {
      setPreco('');
      setFornecedor('');
      dispararAutoSave('', '', 'sem_preco');
    } else if (acao === 'falta') {
      setPreco('');
      setFornecedor('');
      dispararAutoSave('', '', 'falta');
    }
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: `5px solid ${corBorda}` }}>
      
      {/* CABEÇALHO DO ITEM */}
      <div onClick={() => abrirModal(produto)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '80%' }}>
          <div style={{ width: '35px', height: '35px', borderRadius: '6px', backgroundImage: `url(${produto.foto_url?.split(',')[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f1f5f9' }} />
          <div style={{ overflow: 'hidden' }}>
            <strong style={{ display: 'block', fontSize: '14px', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{produto.nome}</strong>
            <div style={{ display: 'flex', gap: '5px', marginTop: '2px' }}>
              <span style={{fontSize: '9px', background: '#f1f5f9', color: '#64748b', padding: '2px 4px', borderRadius: '4px', fontWeight: 'bold'}}>{produto.unidade_medida || 'UN'}</span>
              {produto.promocao && <span style={{fontSize: '9px', background: '#fefce8', color: '#ca8a04', padding: '2px 6px', borderRadius: '4px', fontWeight: '900'}}>PROMO</span>}
              {produto.novidade && <span style={{fontSize: '9px', background: '#eff6ff', color: '#2563eb', padding: '2px 6px', borderRadius: '4px', fontWeight: '900'}}>NOVO</span>}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px' }}>{statusAviso}</div>
      </div>

      {/* INPUTS DIRETOS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8', fontWeight: 'bold', fontSize: '11px' }}>R$</span>
          <input 
            type="text" 
            value={preco} 
            onChange={e => setPreco(e.target.value)} 
            onBlur={handleBlur}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            placeholder={produto.preco_anterior && produto.preco_anterior !== 'R$ 0,00' ? produto.preco_anterior.replace('R$ ', '') : "0,00"}
            style={{ width: '100%', padding: '10px 10px 10px 30px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontWeight: '900', fontSize: '14px', backgroundColor: '#f8fafc', boxSizing: 'border-box' }}
          />
        </div>
        <input 
          list="lista-fornecedores"
          type="text" 
          value={fornecedor} 
          onChange={e => setFornecedor(e.target.value)} 
          onBlur={handleBlur}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
          placeholder={produto.fornecedor_anterior || "Fornecedor..."}
          style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontWeight: 'bold', fontSize: '13px', backgroundColor: '#f8fafc', boxSizing: 'border-box', textTransform: 'uppercase' }}
        />
      </div>

      {/* BOTÕES RÁPIDOS */}
      <div style={{ display: 'flex', gap: '5px', borderTop: '1px dashed #f1f5f9', paddingTop: '10px' }}>
        <button onClick={() => acaoRapida('mantido')} style={{ flex: 1, padding: '8px', background: '#fefce8', color: '#eab308', border: '1px solid #fef08a', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>🔒 MANTER</button>
        <button onClick={() => acaoRapida('sem_preco')} style={{ flex: 1, padding: '8px', background: '#fff7ed', color: '#f97316', border: '1px solid #fed7aa', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>⏸️ S/ PREÇO</button>
        <button onClick={() => acaoRapida('falta')} style={{ flex: 1, padding: '8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>🚫 FALTA</button>
      </div>

    </div>
  );
};


// ============================================================================
// TELA PRINCIPAL: PRECIFICACAO
// ============================================================================
export default function Precificacao() {
  const [produtos, setProdutos] = useState([]);
  const [fornecedoresBd, setFornecedoresBd] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState('pendentes');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  
  // Controle do Modal de Edição Completa
  const [modalAberto, setModalAberto] = useState(false);
  const [prodModal, setProdModal] = useState(null);
  const [formModal, setFormModal] = useState({ preco: '', fornecedor: '', status: 'pendente', promocao: false, novidade: false, fotos_novas: [], unidade: 'UN' });
  const [fazendoUpload, setFazendoUpload] = useState(false);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setCarregando(true);
    try {
      const { data: configData } = await supabase.from('configuracoes').select('*').eq('id', 1).single();
      const { data: prodData } = await supabase.from('produtos').select('*').limit(5000).order('nome', { ascending: true });
      const { data: fornData } = await supabase.from('fornecedores').select('*').limit(5000).order('nome_fantasia', { ascending: true });
      
      if (prodData) {
        // 💡 AUTO-CORREÇÃO DE NOVOS PRODUTOS (Garante que caiam em Pendentes)
        const produtosProntos = prodData.map(p => {
          const isZer = !p.preco || p.preco === '0' || p.preco === '0,00' || String(p.preco).trim() === 'R$ 0,00' || String(p.preco).trim() === 'R$0,00';
          const semForn = !p.fornecedor || String(p.fornecedor).trim() === '';
          
          let novoStatus = p.status_cotacao;
          let novoPreco = p.preco;
          let atualizou = false;

          // Se for produto novo sem status, ou ativo mas faltando dados, joga pra pendente
          if (!novoStatus || (novoStatus === 'ativo' && (isZer || semForn))) {
             novoStatus = 'pendente';
             atualizou = true;
          }

          // Padroniza o preço nulo/zerado
          if (!novoPreco || novoPreco === '0' || String(novoPreco).trim() === '') {
            novoPreco = 'R$ 0,00';
            atualizou = true;
          }

          if (atualizou) {
            // Conserta o erro de fábrica direto no banco silenciosamente
            supabase.from('produtos').update({ status_cotacao: novoStatus, preco: novoPreco }).eq('id', p.id).then();
            return { ...p, status_cotacao: novoStatus, preco: novoPreco };
          }
          return p;
        });

        setProdutos(produtosProntos);
      }
      
      if (fornData) setFornecedoresBd(fornData);
    } catch (error) { console.error("Erro VIRTUS:", error); } 
    finally { setCarregando(false); }
  }

  const isZerado = (preco) => !preco || preco === '0' || preco === '0,00' || String(preco).trim() === 'R$ 0,00' || String(preco).trim() === 'R$0,00';

  // Categorização das Abas
  const listas = {
    pendentes: produtos.filter(p => p.status_cotacao === 'pendente' || !p.status_cotacao || (p.status_cotacao === 'ativo' && (isZerado(p.preco) || !p.fornecedor))),
    prontos: produtos.filter(p => p.status_cotacao === 'ativo' && !isZerado(p.preco) && p.fornecedor),
    mantidos: produtos.filter(p => p.status_cotacao === 'mantido'),
    sem_preco: produtos.filter(p => p.status_cotacao === 'sem_preco'),
    falta: produtos.filter(p => p.status_cotacao === 'falta')
  };

  const qtdPendentes = listas.pendentes.length;

  const zerarCotacao = async () => {
    if (!window.confirm("🚨 TEM CERTEZA?\nIsso vai apagar os preços atuais, promoções e novidades, mas manterá as FOTOS. Todos os itens irão para Pendentes.")) return;
    
    setCarregando(true);
    await supabase.from('configuracoes').update({ precos_liberados: false }).eq('id', 1);

    const payloadGeral = produtos.map(p => {
      if (p.status_cotacao === 'mantido') {
        return { 
          id: p.id, 
          status_cotacao: 'pendente'
        };
      }
      return {
        id: p.id,
        status_cotacao: 'pendente',
        preco: 'R$ 0,00',
        fornecedor: '',
        promocao: false,
        novidade: false
        // Foto intocada
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
      alert("✅ Cotação Zerada! Preços limpos, fotos preservadas."); 
      carregarDados(); 
      setAbaAtiva('pendentes');
    } else {
      setCarregando(false);
    }
  };

  const finalizarCotacao = async () => {
    if (qtdPendentes > 0) {
      if (!window.confirm(`⚠️ ATENÇÃO: Você ainda tem ${qtdPendentes} itens PENDENTES sem preço ou fornecedor.\n\nTem certeza que deseja enviar os preços e ABRIR A LOJA para os clientes mesmo assim?`)) return;
    }
    
    setCarregando(true);
    const { error } = await supabase.from('configuracoes').update({ precos_liberados: true }).eq('id', 1);
    setCarregando(false);
    
    if (error) alert("Erro ao liberar loja.");
    else alert("🚀 LOJA ABERTA! Preços atualizados e disponíveis para os clientes.");
  };

  const handleAtualizarLista = (id, payload) => {
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
  };

  // --- LÓGICA DO MODAL DE EDIÇÃO ---
  const abrirEdicaoCompleta = (produto) => {
    setProdModal(produto);
    setFormModal({
      preco: produto.preco && produto.preco !== 'R$ 0,00' ? produto.preco.replace('R$ ', '') : '',
      fornecedor: produto.fornecedor || '',
      status: produto.status_cotacao || 'pendente',
      promocao: produto.promocao || false,
      novidade: produto.novidade || false,
      fotos_novas: [],
      unidade: produto.unidade_medida || 'UN'
    });
    setModalAberto(true);
  };

  const handleUploadFotos = async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    setFazendoUpload(true);
    const urlsSalvas = [];
    for (const file of files) {
      const fileName = `prod_${prodModal.id}_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('frazao-midia').upload(`produtos/${fileName}`, file);
      if (!error) {
        const { data } = supabase.storage.from('frazao-midia').getPublicUrl(`produtos/${fileName}`);
        urlsSalvas.push(data.publicUrl);
      }
    }
    setFormModal(prev => ({ ...prev, fotos_novas: [...prev.fotos_novas, ...urlsSalvas] }));
    setFazendoUpload(false);
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
    // 💡 FORMATADOR DE MOEDA DO MODAL COMPLETO
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
    if (statusCalc === 'pendente' && precoFinal !== 'R$ 0,00' && formModal.fornecedor) statusCalc = 'ativo';

    if ((statusCalc === 'ativo' || statusCalc === 'mantido') && (!formModal.fornecedor.trim())) {
      return alert("⚠️ É obrigatório informar o Fornecedor.");
    }

    const fotosAtuais = prodModal.foto_url ? String(prodModal.foto_url).split(',') : [];
    const qtdFotos = fotosAtuais.length + formModal.fotos_novas.length;
    if ((formModal.promocao || formModal.novidade) && qtdFotos === 0) {
      return alert("⚠️ Adicione pelo menos uma foto para marcar como Promoção ou Novidade.");
    }

    const payload = {
      preco: precoFinal,
      fornecedor: formModal.status === 'falta' || formModal.status === 'sem_preco' ? '' : formModal.fornecedor.toUpperCase(),
      status_cotacao: statusCalc,
      promocao: formModal.promocao,
      novidade: formModal.novidade,
      unidade_medida: formModal.unidade,
      foto_url: [...fotosAtuais, ...formModal.fotos_novas].filter(f=>f).join(',')
    };

    if (statusCalc === 'ativo' || statusCalc === 'mantido') {
      payload.preco_anterior = payload.preco;
      payload.fornecedor_anterior = payload.fornecedor;
    }

    setCarregando(true);
    const { error } = await supabase.from('produtos').update(payload).eq('id', prodModal.id);
    if (error) alert("Erro: " + error.message);
    
    handleAtualizarLista(prodModal.id, payload);
    setCarregando(false);
    setModalAberto(false);
  };

  if (carregando) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando Sistema...</div>;

  const CONFIG_ABAS = [
    { id: 'pendentes', nomeStr: 'PENDENTES', cor: '#3b82f6', icone: '⏳', itens: listas.pendentes },
    { id: 'prontos', nomeStr: 'PRONTOS', cor: '#22c55e', icone: '✅', itens: listas.prontos },
    { id: 'mantidos', nomeStr: 'MANTIDOS', cor: '#eab308', icone: '🔒', itens: listas.mantidos },
    { id: 'sem_preco', nomeStr: 'S/ PREÇO', cor: '#f97316', icone: '⏸️', itens: listas.sem_preco },
    { id: 'falta', nomeStr: 'FALTA', cor: '#ef4444', icone: '🚫', itens: listas.falta },
  ];

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '120px', padding: '10px' }}>
      
      <datalist id="lista-fornecedores">
        {fornecedoresBd.map(f => <option key={f.id} value={f.nome_fantasia} />)}
      </datalist>

      {/* 🎛️ HEADER DE COMANDO */}
      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '900' }}>💲 PRECIFICAÇÃO</h2>
            <p style={{ margin: '5px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>Faltam <strong style={{color: '#ef4444', fontSize: '16px'}}>{qtdPendentes}</strong> itens.</p>
          </div>
          <button onClick={zerarCotacao} style={{ background: '#333', color: '#ef4444', border: 'none', padding: '10px 15px', borderRadius: '10px', fontWeight: '900', fontSize: '11px', cursor: 'pointer' }}>
            🗑️ ZERAR COTAÇÃO
          </button>
        </div>

        <button onClick={finalizarCotacao} style={{ width: '100%', backgroundColor: '#22c55e', color: 'white', border: 'none', padding: '18px', borderRadius: '16px', fontWeight: '900', fontSize: '15px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(34,197,94,0.3)' }}>
          🚀 FINALIZAR COTAÇÃO E ABRIR LOJA
        </button>

      </div>

      {/* 📑 ABAS DE NAVEGAÇÃO COM CORES DEFINIDAS */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px', scrollbarWidth: 'none' }}>
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
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '12px', display: 'flex', gap: '10px', marginBottom: '15px', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
        <span>🔍</span><input placeholder="Buscar item..." value={busca} onChange={e => setBusca(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
      </div>

      {/* 📝 LISTA RENDERIZADA */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {listas[abaAtiva].filter(p => p.nome.toLowerCase().includes(busca.toLowerCase())).map(p => (
           <LinhaProduto 
             key={p.id} 
             produto={p} 
             abas={CONFIG_ABAS}
             abaAtiva={abaAtiva}
             corBorda={CONFIG_ABAS.find(a => a.id === p.status_cotacao)?.cor || '#3b82f6'}
             abrirModal={abrirEdicaoCompleta} 
             aoSalvar={handleAtualizarLista} 
           />
        ))}
        {listas[abaAtiva].length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: '#fff', borderRadius: '16px' }}>Nenhum item nesta aba.</div>
        )}
      </div>

      {/* 🛠️ MODAL DE EDIÇÃO COMPLETA */}
      {modalAberto && prodModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', padding: '0' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '600px', borderRadius: '30px 30px 0 0', padding: '30px 25px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>✏️ Edição Completa</h3>
              <button onClick={() => setModalAberto(false)} style={{ background: '#f1f5f9', border: 'none', width: '35px', height: '35px', borderRadius: '50%', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
            </div>

            <strong style={{ fontSize: '16px', color: '#111', marginBottom: '20px', display: 'block' }}>{prodModal.nome}</strong>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '25px' }}>
              <button onClick={() => {
                const pAntigo = prodModal.preco_anterior ? prodModal.preco_anterior.replace('R$ ', '') : '';
                const fAntigo = prodModal.fornecedor_anterior || '';
                setFormModal({...formModal, status: 'mantido', preco: pAntigo, fornecedor: fAntigo});
              }} style={{ padding: '10px', borderRadius: '10px', border: formModal.status === 'mantido' ? '2px solid #eab308' : '1px solid #e2e8f0', background: formModal.status === 'mantido' ? '#fefce8' : '#fff', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer', color: formModal.status === 'mantido' ? '#ca8a04' : '#666' }}>
                🔒 MANTER
              </button>
              <button onClick={() => setFormModal({...formModal, status: 'sem_preco', preco: '', fornecedor: ''})} style={{ padding: '10px', borderRadius: '10px', border: formModal.status === 'sem_preco' ? '2px solid #f97316' : '1px solid #e2e8f0', background: formModal.status === 'sem_preco' ? '#fff7ed' : '#fff', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer', color: formModal.status === 'sem_preco' ? '#ea580c' : '#666' }}>
                ⏸️ S/ PREÇO
              </button>
              <button onClick={() => setFormModal({...formModal, status: 'falta', preco: '', fornecedor: ''})} style={{ padding: '10px', borderRadius: '10px', border: formModal.status === 'falta' ? '2px solid #ef4444' : '1px solid #e2e8f0', background: formModal.status === 'falta' ? '#fef2f2' : '#fff', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer', color: formModal.status === 'falta' ? '#ef4444' : '#666' }}>
                🚫 FALTA
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>VENDA (R$)</label>
                <input 
                  type="text" value={formModal.preco} 
                  placeholder={prodModal.preco_anterior ? prodModal.preco_anterior.replace('R$ ', '') : "0,00"}
                  onChange={e => setFormModal({...formModal, preco: e.target.value, status: 'ativo'})} 
                  disabled={formModal.status === 'falta' || formModal.status === 'sem_preco'}
                  style={{ width: '100%', padding: '15px', borderRadius: '10px', border: '2px solid #f1f5f9', outline: 'none', fontSize: '16px', fontWeight: '900', boxSizing: 'border-box' }} 
                />
              </div>

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

              <div style={{ flex: 2 }}>
                <label style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '5px' }}>FORNECEDOR *</label>
                <input 
                  list="lista-fornecedores" type="text" value={formModal.fornecedor} 
                  placeholder={prodModal.fornecedor_anterior || "Fornecedor..."}
                  onChange={e => setFormModal({...formModal, fornecedor: e.target.value, status: 'ativo'})} 
                  disabled={formModal.status === 'falta' || formModal.status === 'sem_preco'}
                  style={{ width: '100%', padding: '15px', borderRadius: '10px', border: '2px solid #f1f5f9', outline: 'none', fontSize: '14px', boxSizing: 'border-box', textTransform: 'uppercase' }} 
                />
              </div>
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
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', scrollbarWidth: 'none' }}>
              <label style={{ minWidth: '70px', height: '70px', borderRadius: '10px', border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backgroundColor: '#f8fafc' }}>
                <span style={{ fontSize: '20px' }}>{fazendoUpload ? '⏳' : '📸'}</span>
                <input type="file" multiple accept="image/*" onChange={handleUploadFotos} style={{ display: 'none' }} disabled={fazendoUpload} />
              </label>
              {[...(prodModal.foto_url ? String(prodModal.foto_url).split(',') : []), ...formModal.fotos_novas].filter(f=>f).map((url, i) => (
                <div key={i} style={{ minWidth: '70px', height: '70px', borderRadius: '10px', backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                  <button onClick={() => removerFoto(i)} style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#ef4444', color: 'white', border: 'none', width: '20px', height: '20px', borderRadius: '50%', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>

            <button onClick={salvarModal} style={{ width: '100%', padding: '20px', backgroundColor: '#111', color: 'white', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '16px', marginTop: '10px', cursor: 'pointer' }}>
              💾 SALVAR E FECHAR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}