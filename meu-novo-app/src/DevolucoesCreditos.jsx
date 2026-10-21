import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const ORDEM_LOJAS = [
  "FLAMINGO", "PARANOÁ", "411", "404", "QE15", "QE30", 
  "QUALIDADE", "XEPA", "MANSÕES", "Q6", "VARJÃO", "215", "313", "307"
];

const ordenarLojas = (lojasArray) => {
  if (!Array.isArray(lojasArray)) return lojasArray;
  return [...lojasArray].sort((a, b) => {
    const nA = String(a.nome_fantasia || a.loja || a.nome || a.nome_loja || "").toUpperCase();
    const nB = String(b.nome_fantasia || b.loja || b.nome || a.nome_loja || "").toUpperCase();
    
    if (nA.includes('FRAZÃO')) return -1;
    if (nB.includes('FRAZÃO')) return 1;

    let iA = ORDEM_LOJAS.findIndex(nome => nA.includes(nome));
    let iB = ORDEM_LOJAS.findIndex(nome => nB.includes(nome));
    
    if (iA === -1) iA = 999;
    if (iB === -1) iB = 999;
    
    return iA - iB;
  });
};

export default function DevolucoesCreditos() {
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(obterDataLocal());
  const [lojas, setLojas] = useState([]);
  const [produtosBd, setProdutosBd] = useState([]);
  const [fornecedoresBd, setFornecedoresBd] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [abaCreditos, setAbaCreditos] = useState('pendentes');

  // Estados para o Modal de Edição
  const [modalEditAberto, setModalEditAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);

  const [novoCredito, setNovoCredito] = useState({
    tipo_registro: 'CREDITO',
    loja_id: '',
    nome_produto: '',
    quantidade: '',
    unidade_medida: 'KG',
    fornecedor: '',
    valor_unit: '',
    nao_fazer_nota: false
  });

  const qtdNum = parseFloat(novoCredito.quantidade) || 0;
  const valNum = parseFloat(String(novoCredito.valor_unit || '0').replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
  const totalCalculado = qtdNum * valNum;

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros !== '' ? parseInt(apenasNumeros, 10) : null;
  };

  const carregarDados = async () => {
    try {
      setCarregando(true);
      const { data: dLojas } = await supabase.from('lojas').select('*').order('nome_fantasia', { ascending: true });
      let lojasDb = dLojas || [];
      const temFrazao = lojasDb.some(l => extrairNum(l.codigo_loja) === 0);
      if (!temFrazao) {
        lojasDb.unshift({ id: 99999, codigo_loja: '00', nome_fantasia: 'FRAZÃO (TESTE)' });
      }

      setLojas(ordenarLojas(lojasDb));

      const { data: dProdutos } = await supabase.from('produtos').select('id, nome, preco, unidade_medida');
      setProdutosBd(dProdutos || []);

      const { data: dForn } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
      setFornecedoresBd(dForn || []);

      const { data: crd } = await supabase.from('perdas_creditos').select('*').eq('data_registro', dataFiltro);
      setCreditos(crd || []);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [dataFiltro]);

  const salvarCredito = async () => {
    if (!novoCredito.loja_id || !novoCredito.nome_produto || !novoCredito.quantidade) {
      return alert("Preencha a loja, o produto e a quantidade.");
    }

    const fornFinal = novoCredito.nao_fazer_nota ? 'Não Fazer Nota' : (novoCredito.fornecedor.trim().toUpperCase() || 'SEM FORNECEDOR');

    const nomeProdFinal = novoCredito.tipo_registro === 'COBRANCA' 
      ? `[COBRANÇA] ${novoCredito.nome_produto.toUpperCase().trim()}`
      : novoCredito.nome_produto.toUpperCase().trim();

    setCarregando(true);
    try {
      const payload = {
        data_registro: dataFiltro,
        loja_id: novoCredito.loja_id,
        nome_produto: nomeProdFinal,
        quantidade: parseFloat(novoCredito.quantidade),
        unidade_medida: novoCredito.unidade_medida,
        fornecedor: fornFinal,
        valor_unit: valNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        status: 'pendente'
      };

      const { error } = await supabase.from('perdas_creditos').insert([payload]);
      if (error) throw error;

      alert(`✅ ${novoCredito.tipo_registro === 'CREDITO' ? 'Crédito' : 'Cobrança'} registrado com sucesso!`);
      setNovoCredito({
        tipo_registro: 'CREDITO',
        loja_id: '',
        nome_produto: '',
        quantidade: '',
        unidade_medida: 'KG',
        fornecedor: '',
        valor_unit: '',
        nao_fazer_nota: false
      });
      carregarDados();
    } catch (e) {
      alert("Erro ao salvar: " + e.message);
      setCarregando(false);
    }
  };

  const alterarStatusCredito = async (idCredito, novoStatus) => {
    setCarregando(true);
    try {
      await supabase.from('perdas_creditos').update({ status: novoStatus }).eq('id', idCredito);
      carregarDados();
    } catch (err) {
      alert("Erro ao atualizar status: " + err.message);
      setCarregando(false);
    }
  };

  const abrirEdicao = (item) => {
    const isCob = String(item.nome_produto || '').includes('[COBRANÇA]');
    const nomeLimpo = isCob ? item.nome_produto.replace('[COBRANÇA]', '').trim() : item.nome_produto;
    const isNaoNota = String(item.fornecedor || '').toUpperCase() === 'NÃO FAZER NOTA';

    setItemEditando({
      ...item,
      tipo_registro: isCob ? 'COBRANCA' : 'CREDITO',
      nome_produto: nomeLimpo,
      fornecedor: isNaoNota ? '' : item.fornecedor,
      nao_fazer_nota: isNaoNota
    });
    setModalEditAberto(true);
  };

  const salvarEdicaoItem = async () => {
    if (!itemEditando.loja_id || !itemEditando.nome_produto || !itemEditando.quantidade) {
      return alert("Preencha a loja, o produto e a quantidade.");
    }

    const valNumEdit = parseFloat(String(itemEditando.valor_unit || '0').replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
    const fornFinalEdit = itemEditando.nao_fazer_nota ? 'Não Fazer Nota' : (String(itemEditando.fornecedor || '').trim().toUpperCase() || 'SEM FORNECEDOR');

    const nomeProdFinalEdit = itemEditando.tipo_registro === 'COBRANCA' 
      ? `[COBRANÇA] ${itemEditando.nome_produto.toUpperCase().trim()}`
      : itemEditando.nome_produto.toUpperCase().trim();

    setCarregando(true);
    try {
      const payloadEdit = {
        loja_id: itemEditando.loja_id,
        nome_produto: nomeProdFinalEdit,
        quantidade: parseFloat(itemEditando.quantidade),
        unidade_medida: itemEditando.unidade_medida,
        fornecedor: fornFinalEdit,
        valor_unit: valNumEdit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      };

      const { error } = await supabase.from('perdas_creditos').update(payloadEdit).eq('id', itemEditando.id);
      if (error) throw error;

      alert("✅ Registro atualizado com sucesso!");
      setModalEditAberto(false);
      setItemEditando(null);
      carregarDados();
    } catch (e) {
      alert("Erro ao atualizar: " + e.message);
      setCarregando(false);
    }
  };

  const excluirRegistro = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este registro permanentemente?")) return;
    setCarregando(true);
    try {
      const { error } = await supabase.from('perdas_creditos').delete().eq('id', id);
      if (error) throw error;

      alert("🗑️ Registro excluído com sucesso!");
      setModalEditAberto(false);
      setItemEditando(null);
      carregarDados();
    } catch (e) {
      alert("Erro ao excluir: " + e.message);
      setCarregando(false);
    }
  };

  if (carregando && !creditos.length) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif', color: '#fff' }}>🔄 Carregando painel...</div>;

  const creditosFiltrados = creditos.filter(c => {
    if (abaCreditos === 'pendentes') return c.status !== 'resolvido';
    return c.status === 'resolvido';
  });

  return (
    <div style={{ width: '95%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '120px' }}>
      
      {/* DATALISTS PARA BUSCA INTELIGENTE */}
      <datalist id="lista-produtos-credito">
        {produtosBd.map((p, i) => (
          <option key={i} value={p.nome} />
        ))}
      </datalist>

      <datalist id="lista-fornecedores-credito">
        <option value="NÃO FAZER NOTA" />
        <option value="SEM FORNECEDOR" />
        {fornecedoresBd.map((f, i) => (
          <option key={i} value={(f.nome_fantasia || f.nome_completo || '').toUpperCase().trim()} />
        ))}
      </datalist>

      {/* MODAL DE EDIÇÃO */}
      {modalEditAberto && itemEditando && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '15px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '25px', width: '100%', maxWidth: '550px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', borderTop: '8px solid #3b82f6', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#111' }}>✏️ Editar Registro</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Tipo de Lançamento:</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setItemEditando({ ...itemEditando, tipo_registro: 'CREDITO' })}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: itemEditando.tipo_registro === 'CREDITO' ? '2px solid #16a34a' : '1px solid #cbd5e1', background: itemEditando.tipo_registro === 'CREDITO' ? '#f0fdf4' : '#f8fafc', color: itemEditando.tipo_registro === 'CREDITO' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
                  >
                    🔄 Crédito
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemEditando({ ...itemEditando, tipo_registro: 'COBRANCA' })}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: itemEditando.tipo_registro === 'COBRANCA' ? '2px solid #dc2626' : '1px solid #cbd5e1', background: itemEditando.tipo_registro === 'COBRANCA' ? '#fef2f2' : '#f8fafc', color: itemEditando.tipo_registro === 'COBRANCA' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
                  >
                    ⚠️ Cobrança
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Loja Solicitante:</label>
                <select 
                  value={itemEditando.loja_id} 
                  onChange={(e) => setItemEditando({ ...itemEditando, loja_id: e.target.value })} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
                >
                  <option value="">Selecione a Loja...</option>
                  {lojas.map(l => (
                    <option key={l.id} value={l.codigo_loja}>{l.nome_fantasia}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Nome do Produto:</label>
                <input 
                  type="text" 
                  list="lista-produtos-credito"
                  value={itemEditando.nome_produto} 
                  onChange={(e) => setItemEditando({ ...itemEditando, nome_produto: e.target.value })} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none', textTransform: 'uppercase' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Quantidade:</label>
                  <input 
                    type="number" 
                    value={itemEditando.quantidade} 
                    onChange={(e) => setItemEditando({ ...itemEditando, quantidade: e.target.value })} 
                    style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', textAlign: 'center', fontWeight: 'bold', outline: 'none' }}
                  />
                </div>
                <div style={{ width: '90px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Unidade:</label>
                  <select 
                    value={itemEditando.unidade_medida} 
                    onChange={(e) => setItemEditando({ ...itemEditando, unidade_medida: e.target.value })} 
                    style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', fontWeight: 'bold', outline: 'none' }}
                  >
                    <option value="KG">KG</option>
                    <option value="CX">CX</option>
                    <option value="UN">UN</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Fornecedor Entregador:</label>
                <input 
                  type="text" 
                  list="lista-fornecedores-credito"
                  disabled={itemEditando.nao_fazer_nota}
                  value={itemEditando.nao_fazer_nota ? '' : itemEditando.fornecedor} 
                  placeholder={itemEditando.nao_fazer_nota ? "Atribuído para Não Fazer Nota" : "Digite para buscar o fornecedor..."}
                  onChange={(e) => setItemEditando({ ...itemEditando, fornecedor: e.target.value })} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: itemEditando.nao_fazer_nota ? '#e2e8f0' : '#f8fafc', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Valor Unitário:</label>
                <input 
                  type="text" 
                  value={itemEditando.valor_unit} 
                  onChange={(e) => setItemEditando({ ...itemEditando, valor_unit: e.target.value })} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
                />
              </div>

              <div style={{ padding: '10px', backgroundColor: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="checkbox" 
                  id="chkNotaEdit" 
                  checked={itemEditando.nao_fazer_nota} 
                  onChange={(e) => setItemEditando({ ...itemEditando, nao_fazer_nota: e.target.checked, fornecedor: e.target.checked ? 'Não Fazer Nota' : '' })} 
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="chkNotaEdit" style={{ fontSize: '12px', fontWeight: 'bold', color: '#92400e', cursor: 'pointer' }}>
                  Atribuir ao Fornecedor Fantasma: "Não Fazer Nota"
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button 
                  onClick={salvarEdicaoItem} 
                  style={{ flex: 1, padding: '12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                >
                  💾 Salvar Alterações
                </button>
                <button 
                  onClick={() => excluirRegistro(itemEditando.id)} 
                  style={{ padding: '12px 15px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                >
                  🗑️ Excluir
                </button>
                <button 
                  onClick={() => { setModalEditAberto(false); setItemEditando(null); }} 
                  style={{ padding: '12px 15px', backgroundColor: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CABEÇALHO */}
      <div style={{ backgroundColor: '#111', padding: '20px', borderRadius: '20px', color: 'white', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔄 PAINEL DE DEVOLUÇÕES E CRÉDITOS
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
            <span style={{ color: '#94a3b8', fontSize: '13px' }}>Data:</span>
            <input 
              type="date" 
              value={dataFiltro} 
              onChange={(e) => setDataFiltro(e.target.value)}
              style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
            />
          </div>
        </div>
        <button onClick={() => carregarDados()} style={{ background: '#333', border: 'none', color: '#fff', padding: '10px 15px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>🔄</button>
      </div>

      {/* FORMULÁRIO DE CADASTRO */}
      <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '25px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', borderTop: '8px solid #f97316', marginBottom: '30px' }}>
        <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#111' }}>Cadastrar Novo Registro</h3>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Tipo de Lançamento:</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setNovoCredito({ ...novoCredito, tipo_registro: 'CREDITO' })}
              style={{ flex: 1, padding: '12px', borderRadius: '10px', border: novoCredito.tipo_registro === 'CREDITO' ? '2px solid #16a34a' : '1px solid #cbd5e1', background: novoCredito.tipo_registro === 'CREDITO' ? '#f0fdf4' : '#f8fafc', color: novoCredito.tipo_registro === 'CREDITO' ? '#166534' : '#64748b', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
            >
              🔄 Crédito / Devolução
            </button>
            <button
              type="button"
              onClick={() => setNovoCredito({ ...novoCredito, tipo_registro: 'COBRANCA' })}
              style={{ flex: 1, padding: '12px', borderRadius: '10px', border: novoCredito.tipo_registro === 'COBRANCA' ? '2px solid #dc2626' : '1px solid #cbd5e1', background: novoCredito.tipo_registro === 'COBRANCA' ? '#fef2f2' : '#f8fafc', color: novoCredito.tipo_registro === 'COBRANCA' ? '#991b1b' : '#64748b', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
            >
              ⚠️ Cobrança de Loja
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Loja Solicitante:</label>
            <select 
              value={novoCredito.loja_id} 
              onChange={(e) => setNovoCredito({ ...novoCredito, loja_id: e.target.value })} 
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
            >
              <option value="">Selecione a Loja...</option>
              {lojas.map(l => (
                <option key={l.id} value={l.codigo_loja}>{l.nome_fantasia}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Nome do Produto:</label>
            <input 
              type="text" 
              list="lista-produtos-credito"
              placeholder="Digite para buscar o produto..." 
              value={novoCredito.nome_produto} 
              onChange={(e) => setNovoCredito({ ...novoCredito, nome_produto: e.target.value })} 
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none', textTransform: 'uppercase' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Quantidade:</label>
              <input 
                type="number" 
                placeholder="0" 
                value={novoCredito.quantidade} 
                onChange={(e) => setNovoCredito({ ...novoCredito, quantidade: e.target.value })} 
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', textAlign: 'center', fontWeight: 'bold', outline: 'none' }}
              />
            </div>
            <div style={{ width: '90px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Unidade:</label>
              <select 
                value={novoCredito.unidade_medida} 
                onChange={(e) => setNovoCredito({ ...novoCredito, unidade_medida: e.target.value })} 
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', fontWeight: 'bold', outline: 'none' }}
              >
                <option value="KG">KG</option>
                <option value="CX">CX</option>
                <option value="UN">UN</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Fornecedor Entregador:</label>
            <input 
              type="text" 
              list="lista-fornecedores-credito"
              disabled={novoCredito.nao_fazer_nota}
              placeholder={novoCredito.nao_fazer_nota ? "Atribuído para Não Fazer Nota" : "Digite para buscar o fornecedor..."} 
              value={novoCredito.fornecedor} 
              onChange={(e) => setNovoCredito({ ...novoCredito, fornecedor: e.target.value })} 
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: novoCredito.nao_fazer_nota ? '#e2e8f0' : '#f8fafc', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Valor Unitário:</label>
            <input 
              type="text" 
              placeholder="R$ 0,00" 
              value={novoCredito.valor_unit} 
              onChange={(e) => setNovoCredito({ ...novoCredito, valor_unit: e.target.value })} 
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ padding: '10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', textAlign: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#166534', display: 'block' }}>VALOR TOTAL:</span>
              <span style={{ fontSize: '15px', fontWeight: '900', color: '#15803d' }}>
                {totalCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input 
            type="checkbox" 
            id="chkNotaCredito" 
            checked={novoCredito.nao_fazer_nota} 
            onChange={(e) => setNovoCredito({ ...novoCredito, nao_fazer_nota: e.target.checked })} 
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <label htmlFor="chkNotaCredito" style={{ fontSize: '12px', fontWeight: 'bold', color: '#92400e', cursor: 'pointer' }}>
            Atribuir ao Fornecedor Fantasma: "Não Fazer Nota" (Desconto direto sem nota fiscal)
          </label>
        </div>

        <button 
          onClick={salvarCredito} 
          style={{ width: '100%', marginTop: '20px', padding: '15px', backgroundColor: '#f97316', color: 'white', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
        >
          <span>💾</span> SALVAR REGISTRO PARA PROCESSAMENTO
        </button>
      </div>

      {/* LISTAGEM DE REGISTROS COM ABAS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', marginLeft: '10px', marginRight: '10px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, color: '#333' }}>Registros Salvos</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setAbaCreditos('pendentes')}
            style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: abaCreditos === 'pendentes' ? '#f97316' : '#e2e8f0', color: abaCreditos === 'pendentes' ? '#fff' : '#475569', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
          >
            ⏳ Pendentes ({creditos.filter(c => c.status !== 'resolvido').length})
          </button>
          <button 
            onClick={() => setAbaCreditos('feitos')}
            style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: abaCreditos === 'feitos' ? '#22c55e' : '#e2e8f0', color: abaCreditos === 'feitos' ? '#fff' : '#475569', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
          >
            ✅ Feitos ({creditos.filter(c => c.status === 'resolvido').length})
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', border: '1px solid #eee' }}>
        {creditosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '30px' }}>Nenhum registro encontrado nesta aba para esta data.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {creditosFiltrados.map((c, i) => {
              const lojaObj = lojas.find(l => String(l.codigo_loja) === String(c.loja_id));
              const nomeLoja = lojaObj ? lojaObj.nome_fantasia : `Loja ${c.loja_id}`;
              const resolvido = c.status === 'resolvido';
              const isCobranca = String(c.nome_produto || '').includes('[COBRANÇA]');
              const nomeProdutoLimpo = isCobranca ? c.nome_produto.replace('[COBRANÇA]', '').trim() : c.nome_produto;

              const pUnitItem = parseFloat(String(c.valor_unit || '0').replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
              const totalItemCalc = Number(c.quantidade || 0) * pUnitItem;

              return (
                <div key={c.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: resolvido ? '#f1f5f9' : (isCobranca ? '#fef2f2' : '#f8fafc'), borderRadius: '14px', border: isCobranca ? '1px solid #fca5a5' : '1px solid #e2e8f0', opacity: resolvido ? 0.7 : 1, flexWrap: 'wrap', gap: '12px' }}>
                  
                  {/* Bloco de Informações com Destaque Forte nas 3 Infos Principais: Loja, Produto e Fornecedor */}
                  <div style={{ flex: 1, minWidth: '260px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', fontWeight: '900', padding: '2px 8px', borderRadius: '6px', background: isCobranca ? '#fee2e2' : '#dcfce7', color: isCobranca ? '#991b1b' : '#166534' }}>
                        {isCobranca ? '⚠️ COBRANÇA DE LOJA' : '🔄 CRÉDITO / DEVOLUÇÃO'}
                      </span>
                    </div>

                    {/* DESTAQUE 1 & 2: Loja e Nome do Produto */}
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', marginBottom: '4px' }}>
                      <span style={{ color: '#2563eb', marginRight: '6px' }}>{nomeLoja}</span> - <span style={{ textTransform: 'uppercase' }}>{nomeProdutoLimpo}</span>
                    </div>

                    {/* DESTAQUE 3: Fornecedor */}
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#d97706', marginBottom: '6px' }}>
                      Fornecedor: {c.fornecedor}
                    </div>

                    {/* Itens Secundários Mais Apagados */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
                      <span>Qtd: <b style={{ color: '#64748b' }}>{c.quantidade} {c.unidade_medida}</b></span>
                      <span>•</span>
                      <span>Unit: <b style={{ color: '#64748b' }}>{c.valor_unit}</b></span>
                    </div>
                  </div>

                  {/* Lado Direito: Valor Total e Botões de Ação */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '15px', fontWeight: '900', color: isCobranca ? '#dc2626' : '#16a34a', display: 'block' }}>
                        {totalItemCalc.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px', background: resolvido ? '#dcfce7' : '#fef3c7', color: resolvido ? '#166534' : '#92400e' }}>
                        {resolvido ? '✓ PROCESSADO' : '⏳ PENDENTE'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        onClick={() => abrirEdicao(c)} 
                        style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                        title="Editar ou excluir registro"
                      >
                        ✏️ Editar
                      </button>

                      {resolvido ? (
                        <button 
                          onClick={() => alterarStatusCredito(c.id, 'pendente')} 
                          style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                          title="Desmarcar concluído e voltar para pendentes"
                        >
                          ↩ Desfazer
                        </button>
                      ) : (
                        <button 
                          onClick={() => alterarStatusCredito(c.id, 'resolvido')} 
                          style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                          title="Marcar como feito"
                        >
                          ✓ Feito
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}