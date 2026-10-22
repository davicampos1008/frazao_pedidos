import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const ORDEM_LOJAS = [
  "FLAMINGO", "PARANOÁ", "411", "404", "QE15", "QE30", 
  "QUALIDADE", "XEPA", "MANSÕES", "Q6", "VARJÃO", "215", "313", "307"
];

// Helper para remover acentos e facilitar a busca
const removerAcentos = (texto) => {
  if (!texto) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const ordenarLojas = (lojasArray) => {
  if (!Array.isArray(lojasArray)) return lojasArray;
  return [...lojasArray].sort((a, b) => {
    const nA = removerAcentos(String(a.nome_fantasia || a.loja || a.nome || a.nome_loja || "")).toUpperCase();
    const nB = removerAcentos(String(b.nome_fantasia || b.loja || b.nome || a.nome_loja || "")).toUpperCase();
    
    if (nA.includes('FRAZAO')) return -1;
    if (nB.includes('FRAZAO')) return 1;

    let iA = ORDEM_LOJAS.findIndex(nome => nA.includes(nome));
    let iB = ORDEM_LOJAS.findIndex(nome => nB.includes(nome));
    
    if (iA === -1) iA = 999;
    if (iB === -1) iB = 999;
    
    return iA - iB;
  });
};

const formatarMoedaMascara = (valorAtual) => {
  const apenasDigitos = String(valorAtual).replace(/\D/g, '');
  if (!apenasDigitos) return '';
  const numero = parseInt(apenasDigitos, 10) / 100;
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const extrairValorNumerico = (str) => {
  if (!str) return 0;
  const apenasDigitos = String(str).replace(/\D/g, '');
  return apenasDigitos ? parseFloat(apenasDigitos) / 100 : 0;
};

export default function DevolucoesCreditos() {
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [abaPrincipal, setAbaPrincipal] = useState('cadastro'); // 'cadastro' ou 'conferencia'

  const [dataFiltro, setDataFiltro] = useState(obterDataLocal());
  const [lojas, setLojas] = useState([]);
  const [produtosBd, setProdutosBd] = useState([]);
  const [fornecedoresBd, setFornecedoresBd] = useState([]);
  const [creditos, setCreditos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [abaCreditos, setAbaCreditos] = useState('pendentes');

  const [erros, setErros] = useState({
    loja: false,
    produto: false,
    quantidade: false,
    peso_cx: false,
    preco_caixa: false,
    preco_duzia: false,
    unidades_dz: false,
    preco_bdj: false,
    unidades_bdj: false,
    valor_unit: false,
    fornecedor: false
  });

  const [errosEdit, setErrosEdit] = useState({
    loja: false,
    produto: false,
    quantidade: false,
    peso_cx: false,
    preco_caixa: false,
    valor_unit: false,
    fornecedor: false
  });

  const [produtoSelecionadoObj, setProdutoSelecionadoObj] = useState(null);
  const [modalEditAberto, setModalEditAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);

  const [novoCredito, setNovoCredito] = useState({
    tipo_registro: 'CREDITO',
    loja_id: '',
    nome_produto: '',
    quantidade: '',
    unidade_medida: '',
    e_kg: false,
    e_dz: false,
    unidades_dz: '',
    preco_duzia: '',
    e_bdj: false,
    unidades_bdj: '',
    preco_bdj: '',
    fornecedor: '',
    valor_unit: '',
    peso_cx_padrao: '',
    preco_caixa: '',
    nao_fazer_nota: false
  });

  const unidadeAtualUpper = removerAcentos(String(novoCredito.unidade_medida || '')).toUpperCase();
  const ehKgUnidade = unidadeAtualUpper.includes('KG');
  const ehDzUnidade = unidadeAtualUpper.includes('DZ') || unidadeAtualUpper.includes('DUZIA');
  const ehBdjUnidade = unidadeAtualUpper.includes('BDJ') || unidadeAtualUpper.includes('BANDEJA');

  const qtdNum = parseFloat(novoCredito.quantidade) || 0;
  const pesoCxNum = parseFloat(novoCredito.peso_cx_padrao) || 0;
  const precoCxNum = extrairValorNumerico(novoCredito.preco_caixa);
  const precoDuziaNum = extrairValorNumerico(novoCredito.preco_duzia);
  const undDzNum = parseFloat(novoCredito.unidades_dz) || 0;
  const precoBdjNum = extrairValorNumerico(novoCredito.preco_bdj);
  const undBdjNum = parseFloat(novoCredito.unidades_bdj) || 0;

  let valNum = extrairValorNumerico(novoCredito.valor_unit);
  let totalCalculado = 0;

  if (novoCredito.e_kg && pesoCxNum > 0 && precoCxNum > 0) {
    valNum = precoCxNum / pesoCxNum;
    totalCalculado = qtdNum * valNum;
  } else if (novoCredito.e_dz && precoDuziaNum > 0 && undDzNum > 0) {
    valNum = precoDuziaNum / 12;
    totalCalculado = undDzNum * valNum;
  } else if (novoCredito.e_bdj && precoBdjNum > 0 && undBdjNum > 0) {
    let qtdBdjNaCaixa = 1;
    const matchBdj = unidadeAtualUpper.match(/(\d+)\s*BDJ/);
    if (matchBdj && matchBdj[1]) {
      qtdBdjNaCaixa = parseInt(matchBdj[1], 10);
    }
    valNum = qtdBdjNaCaixa > 0 ? (precoBdjNum / qtdBdjNaCaixa) : precoBdjNum;
    totalCalculado = undBdjNum * valNum;
  } else {
    totalCalculado = qtdNum * valNum;
  }

  const qtdEditNum = parseFloat(itemEditando?.quantidade) || 0;
  const pesoEditNum = parseFloat(itemEditando?.peso_cx_padrao) || 0;
  const precoEditCxNum = extrairValorNumerico(itemEditando?.preco_caixa);
  let valEditNum = extrairValorNumerico(itemEditando?.valor_unit);
  if (itemEditando?.e_kg && pesoEditNum > 0 && precoEditCxNum > 0) {
    valEditNum = precoEditCxNum / pesoEditNum;
  }

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

      const { data: dProdutos } = await supabase.from('produtos').select('id, nome, preco, unidade_medida, peso_caixa');
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

  const handleProdutoChange = (e) => {
    const nomeProd = e.target.value;
    const nomeLimpo = removerAcentos(nomeProd).toUpperCase().trim();
    const prodEncontrado = produtosBd.find(p => removerAcentos(String(p.nome || '')).toUpperCase().trim() === nomeLimpo);

    setProdutoSelecionadoObj(prodEncontrado || null);

    if (prodEncontrado) {
      const unidadeBanco = prodEncontrado.unidade_medida ? String(prodEncontrado.unidade_medida).trim() : '';
      const unidadeUpper = removerAcentos(unidadeBanco).toUpperCase();
      const ehKg = unidadeUpper.includes('KG');
      const ehDz = unidadeUpper.includes('DZ') || unidadeUpper.includes('DUZIA');
      const ehBdj = unidadeUpper.includes('BDJ') || unidadeUpper.includes('BANDEJA');

      let pesoExtraido = '';
      if (prodEncontrado.peso_caixa) {
        pesoExtraido = String(prodEncontrado.peso_caixa).replace(/[^\d.,]/g, '').trim();
      }

      const precoCadastrado = prodEncontrado.preco ? Number(prodEncontrado.preco) : 0;
      const precoFormatado = precoCadastrado > 0 ? (precoCadastrado * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) : '';

      setNovoCredito(prev => ({
        ...prev,
        nome_produto: removerAcentos(nomeProd).toUpperCase(),
        unidade_medida: unidadeBanco,
        e_kg: ehKg,
        e_dz: ehDz,
        unidades_dz: '',
        preco_duzia: '',
        e_bdj: ehBdj,
        unidades_bdj: '',
        preco_bdj: '',
        peso_cx_padrao: pesoExtraido,
        preco_caixa: '',
        valor_unit: precoFormatado ? formatarMoedaMascara(precoFormatado) : ''
      }));
    } else {
      setNovoCredito(prev => ({
        ...prev,
        nome_produto: removerAcentos(nomeProd).toUpperCase(),
        unidade_medida: '',
        e_kg: false,
        e_dz: false,
        unidades_dz: '',
        preco_duzia: '',
        e_bdj: false,
        unidades_bdj: '',
        preco_bdj: '',
        peso_cx_padrao: '',
        preco_caixa: '',
        valor_unit: ''
      }));
    }
  };

  const salvarCredito = async () => {
    const semLoja = !novoCredito.loja_id;
    const semProduto = !novoCredito.nome_produto.trim();
    
    let semQtd = false;
    if (novoCredito.e_dz) {
      semQtd = (!novoCredito.unidades_dz || parseFloat(novoCredito.unidades_dz) <= 0);
    } else if (novoCredito.e_bdj) {
      semQtd = (!novoCredito.unidades_bdj || parseFloat(novoCredito.unidades_bdj) <= 0);
    } else {
      semQtd = (!novoCredito.quantidade || parseFloat(novoCredito.quantidade) <= 0);
    }

    const semPeso = novoCredito.e_kg && (!novoCredito.peso_cx_padrao || parseFloat(novoCredito.peso_cx_padrao) <= 0);
    const semPrecoCx = novoCredito.e_kg && precoCxNum <= 0;
    const semPrecoDz = novoCredito.e_dz && precoDuziaNum <= 0;
    const semPrecoBdj = novoCredito.e_bdj && precoBdjNum <= 0;
    const semValorUnit = !novoCredito.e_kg && !novoCredito.e_dz && !novoCredito.e_bdj && valNum <= 0;
    const semFornecedor = !novoCredito.nao_fazer_nota && !novoCredito.fornecedor.trim();

    const novosErros = {
      loja: semLoja,
      produto: semProduto,
      quantidade: semQtd,
      unidades_dz: novoCredito.e_dz && (!novoCredito.unidades_dz || parseFloat(novoCredito.unidades_dz) <= 0),
      preco_duzia: semPrecoDz,
      unidades_bdj: novoCredito.e_bdj && (!novoCredito.unidades_bdj || parseFloat(novoCredito.unidades_bdj) <= 0),
      preco_bdj: semPrecoBdj,
      peso_cx: semPeso,
      preco_caixa: semPrecoCx,
      valor_unit: semValorUnit,
      fornecedor: semFornecedor
    };

    setErros(novosErros);

    if (Object.values(novosErros).some(Boolean)) {
      alert("⚠️ Preencha todos os campos obrigatórios destacados em vermelho!");
      return;
    }

    const fornFinal = novoCredito.nao_fazer_nota ? 'NAO FAZER NOTA' : (removerAcentos(novoCredito.fornecedor.trim()).toUpperCase() || 'SEM FORNECEDOR');
    
    let qtdFinalSalvar = parseFloat(novoCredito.quantidade) || 0;
    let unidadeFinalDescricao = novoCredito.unidade_medida || '';

    if (novoCredito.e_dz && undDzNum > 0) {
      qtdFinalSalvar = undDzNum;
      unidadeFinalDescricao = `Fracionado: ${undDzNum}und (Ref. ${novoCredito.unidade_medida})`;
    } else if (novoCredito.e_bdj && undBdjNum > 0) {
      qtdFinalSalvar = undBdjNum;
      unidadeFinalDescricao = `Fracionado: ${undBdjNum}bdj (Ref. ${novoCredito.unidade_medida})`;
    } else if (novoCredito.e_kg && qtdNum > 0) {
      qtdFinalSalvar = qtdNum;
      unidadeFinalDescricao = `Fracionado: ${qtdNum}kg (${novoCredito.unidade_medida || 'CX'})`;
    }

    const nomeProdFinal = novoCredito.tipo_registro === 'COBRANCA' 
      ? `[COBRANCA] ${removerAcentos(novoCredito.nome_produto).toUpperCase().trim()}`
      : removerAcentos(novoCredito.nome_produto).toUpperCase().trim();

    setCarregando(true);
    try {
      const dataAtualSistema = obterDataLocal();

      const payload = {
        data_registro: dataAtualSistema,
        loja_id: novoCredito.loja_id,
        nome_produto: nomeProdFinal,
        quantidade: qtdFinalSalvar,
        unidade_medida: unidadeFinalDescricao,
        fornecedor: fornFinal,
        valor_unit: valNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        status: 'pendente'
      };

      const { error } = await supabase.from('perdas_creditos').insert([payload]);
      if (error) throw error;

      alert(`✅ ${novoCredito.tipo_registro === 'CREDITO' ? 'Crédito' : 'Cobrança'} registrado com sucesso para a data de hoje!`);
      setNovoCredito({
        tipo_registro: 'CREDITO',
        loja_id: '',
        nome_produto: '',
        quantidade: '',
        unidade_medida: '',
        e_kg: false,
        e_dz: false,
        unidades_dz: '',
        preco_duzia: '',
        e_bdj: false,
        unidades_bdj: '',
        preco_bdj: '',
        fornecedor: '',
        valor_unit: '',
        peso_cx_padrao: '',
        preco_caixa: '',
        nao_fazer_nota: false
      });
      setErros({ loja: false, produto: false, quantidade: false, unidades_dz: false, preco_duzia: false, unidades_bdj: false, preco_bdj: false, peso_cx: false, preco_caixa: false, valor_unit: false, fornecedor: false });
      setProdutoSelecionadoObj(null);
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
    const isCob = String(item.nome_produto || '').includes('[COBRANCA]') || String(item.nome_produto || '').includes('[COBRANÇA]');
    const nomeLimpo = isCob ? item.nome_produto.replace('[COBRANCA]', '').replace('[COBRANÇA]', '').trim() : item.nome_produto;
    const isNaoNota = removerAcentos(String(item.fornecedor || '')).toUpperCase() === 'NAO FAZER NOTA';

    const prodEncontrado = produtosBd.find(p => removerAcentos(String(p.nome || '')).toUpperCase().trim() === removerAcentos(nomeLimpo).toUpperCase().trim());
    let pesoCaixaEdit = '';
    let unidadeEdit = item.unidade_medida || '';

    if (prodEncontrado) {
      unidadeEdit = prodEncontrado.unidade_medida || unidadeEdit;
      if (prodEncontrado.peso_caixa) {
        pesoCaixaEdit = String(prodEncontrado.peso_caixa).replace(/[^\d.,]/g, '').trim();
      }
    }

    const unidadeUpper = removerAcentos(String(unidadeEdit || '')).toUpperCase();
    const ehKg = unidadeUpper.includes('KG');
    const ehDz = unidadeUpper.includes('DZ') || unidadeUpper.includes('DUZIA');
    const ehBdj = unidadeUpper.includes('BDJ') || unidadeUpper.includes('BANDEJA');

    setItemEditando({
      ...item,
      tipo_registro: isCob ? 'COBRANCA' : 'CREDITO',
      nome_produto: removerAcentos(nomeLimpo).toUpperCase(),
      unidade_medida: unidadeEdit,
      fornecedor: isNaoNota ? '' : removerAcentos(item.fornecedor).toUpperCase(),
      nao_fazer_nota: isNaoNota,
      e_kg: ehKg,
      e_dz: ehDz,
      e_bdj: ehBdj,
      peso_cx_padrao: pesoCaixaEdit,
      preco_caixa: ''
    });
    setErrosEdit({ loja: false, produto: false, quantidade: false, peso_cx: false, preco_caixa: false, valor_unit: false, fornecedor: false });
    setModalEditAberto(true);
  };

  const salvarEdicaoItem = async () => {
    const semLoja = !itemEditando.loja_id;
    const semProduto = !String(itemEditando.nome_produto || '').trim();
    const semQtd = !itemEditando.quantidade || parseFloat(itemEditando.quantidade) <= 0;
    
    const semPeso = itemEditando.e_kg && (!itemEditando.peso_cx_padrao || parseFloat(itemEditando.peso_cx_padrao) <= 0);
    const semPrecoCx = itemEditando.e_kg && precoEditCxNum <= 0;
    const semValorUnit = !itemEditando.e_kg && valEditNum <= 0;
    const semFornecedor = !itemEditando.nao_fazer_nota && !String(itemEditando.fornecedor || '').trim();

    const novosErrosEdit = {
      loja: semLoja,
      produto: semProduto,
      quantidade: semQtd,
      peso_cx: semPeso,
      preco_caixa: semPrecoCx,
      valor_unit: semValorUnit,
      fornecedor: semFornecedor
    };

    setErrosEdit(novosErrosEdit);

    if (Object.values(novosErrosEdit).some(Boolean)) {
      alert("⚠️ Preencha todos os campos obrigatórios destacados em vermelho!");
      return;
    }

    const fornFinalEdit = itemEditando.nao_fazer_nota ? 'NAO FAZER NOTA' : (removerAcentos(String(itemEditando.fornecedor || '')).trim().toUpperCase() || 'SEM FORNECEDOR');
    const nomeProdFinalEdit = itemEditando.tipo_registro === 'COBRANCA' 
      ? `[COBRANCA] ${removerAcentos(itemEditando.nome_produto).toUpperCase().trim()}`
      : removerAcentos(itemEditando.nome_produto).toUpperCase().trim();
    const unidadeFinalEdit = itemEditando.unidade_medida || '';

    setCarregando(true);
    try {
      const payloadEdit = {
        loja_id: itemEditando.loja_id,
        nome_produto: nomeProdFinalEdit,
        quantidade: parseFloat(itemEditando.quantidade),
        unidade_medida: unidadeFinalEdit,
        fornecedor: fornFinalEdit,
        valor_unit: valEditNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

  if (carregando && !creditos.length && abaPrincipal === 'conferencia') return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif', color: '#fff' }}>🔄 Carregando painel...</div>;

  const creditosFiltrados = creditos.filter(c => {
    if (abaCreditos === 'pendentes') return c.status !== 'resolvido';
    return c.status === 'resolvido';
  });

  const alertaSemPeso = novoCredito.e_kg && (!novoCredito.peso_cx_padrao || parseFloat(novoCredito.peso_cx_padrao) === 0);

  return (
    <div style={{ width: '95%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', paddingBottom: '120px' }}>
      
      <datalist id="lista-produtos-credito">
        {produtosBd.map((p, i) => (
          <option key={i} value={removerAcentos(p.nome).toUpperCase()} />
        ))}
      </datalist>

      <datalist id="lista-fornecedores-credito">
        <option value="NAO FAZER NOTA" />
        <option value="SEM FORNECEDOR" />
        {fornecedoresBd.map((f, i) => (
          <option key={i} value={removerAcentos(f.nome_fantasia || f.nome_completo || '').toUpperCase().trim()} />
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
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: errosEdit.loja ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>Loja Solicitante: *</label>
                <select 
                  value={itemEditando.loja_id} 
                  onChange={(e) => { setItemEditando({ ...itemEditando, loja_id: e.target.value }); setErrosEdit({ ...errosEdit, loja: false }); }} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: errosEdit.loja ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
                >
                  <option value="">Selecione a Loja...</option>
                  {lojas.map(l => (
                    <option key={l.id} value={l.codigo_loja}>{l.nome_fantasia}</option>
                  ))}
                </select>
                {errosEdit.loja && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Campo obrigatório</span>}
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: errosEdit.produto ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>Nome do Produto: *</label>
                <input 
                  type="text" 
                  list="lista-produtos-credito"
                  value={itemEditando.nome_produto} 
                  onChange={(e) => {
                    const nomeProd = removerAcentos(e.target.value).toUpperCase();
                    const prodEncr = produtosBd.find(p => removerAcentos(String(p.nome || '')).toUpperCase().trim() === nomeProd.trim());
                    let und = itemEditando.unidade_medida;
                    let pCx = itemEditando.peso_cx_padrao;
                    let ehKg = itemEditando.e_kg;
                    let ehDz = itemEditando.e_dz;
                    let ehBdj = itemEditando.e_bdj;

                    if (prodEncr) {
                      und = prodEncr.unidade_medida || und;
                      const undUp = removerAcentos(String(und)).toUpperCase();
                      ehKg = undUp.includes('KG');
                      ehDz = undUp.includes('DZ') || undUp.includes('DUZIA');
                      ehBdj = undUp.includes('BDJ') || undUp.includes('BANDEJA');
                      if (prodEncr.peso_caixa) pCx = String(prodEncr.peso_caixa).replace(/[^\d.,]/g, '').trim();
                    }

                    setItemEditando({ ...itemEditando, nome_produto: nomeProd, unidade_medida: und, e_kg: ehKg, e_dz: ehDz, e_bdj: ehBdj, peso_cx_padrao: pCx });
                    setErrosEdit({ ...errosEdit, produto: false });
                  }} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: errosEdit.produto ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none', textTransform: 'uppercase' }}
                />
                {errosEdit.produto && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Campo obrigatório</span>}
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: errosEdit.quantidade ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>Quantidade: *</label>
                  <input 
                    type="number" 
                    value={itemEditando.quantidade} 
                    onChange={(e) => { setItemEditando({ ...itemEditando, quantidade: e.target.value }); setErrosEdit({ ...errosEdit, quantidade: false }); }} 
                    style={{ width: '100%', padding: '10px', borderRadius: '10px', border: errosEdit.quantidade ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', textAlign: 'center', fontWeight: 'bold', outline: 'none' }}
                  />
                  {errosEdit.quantidade && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Obrigatório</span>}
                </div>
                
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Unidade (Banco de Dados):</label>
                  <input 
                    type="text" 
                    disabled 
                    value={itemEditando.unidade_medida || ''} 
                    style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#e2e8f0', fontWeight: 'bold', color: '#334155', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: errosEdit.fornecedor ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>Fornecedor Entregador: *</label>
                <input 
                  type="text" 
                  list="lista-fornecedores-credito"
                  disabled={itemEditando.nao_fazer_nota}
                  value={itemEditando.nao_fazer_nota ? '' : itemEditando.fornecedor} 
                  placeholder={itemEditando.nao_fazer_nota ? "Atribuido para NAO FAZER NOTA" : "Digite para buscar o fornecedor..."}
                  onChange={(e) => { setItemEditando({ ...itemEditando, fornecedor: removerAcentos(e.target.value).toUpperCase() }); setErrosEdit({ ...errosEdit, fornecedor: false }); }} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: errosEdit.fornecedor ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: itemEditando.nao_fazer_nota ? '#e2e8f0' : '#f8fafc', outline: 'none' }}
                />
                {errosEdit.fornecedor && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Fornecedor obrigatório</span>}
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: errosEdit.valor_unit ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>
                  {itemEditando.e_kg && pesoEditNum > 0 && precoEditCxNum > 0 ? 'Valor Unitário (Calculado por KG):' : 'Valor Unitário (R$): *'}
                </label>
                <input 
                  type="text" 
                  placeholder="R$ 0,00" 
                  value={itemEditando.e_kg && pesoEditNum > 0 && precoEditCxNum > 0 ? `R$ ${valEditNum.toFixed(2).replace('.', ',')}` : itemEditando.valor_unit} 
                  disabled={itemEditando.e_kg && pesoEditNum > 0 && precoEditCxNum > 0}
                  onChange={(e) => {
                    const fmt = formatarMoedaMascara(e.target.value);
                    setItemEditando({ ...itemEditando, valor_unit: fmt });
                    setErrosEdit({ ...errosEdit, valor_unit: false });
                  }} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: errosEdit.valor_unit ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: itemEditando.e_kg && pesoEditNum > 0 && precoEditCxNum > 0 ? '#e2e8f0' : '#f8fafc', outline: 'none' }}
                />
                {errosEdit.valor_unit && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Valor unitário obrigatório em números</span>}
              </div>

              <div style={{ padding: '10px', backgroundColor: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="checkbox" 
                  id="chkNotaEdit" 
                  checked={itemEditando.nao_fazer_nota} 
                  onChange={(e) => setItemEditando({ ...itemEditando, nao_fazer_nota: e.target.checked, fornecedor: e.target.checked ? 'NAO FAZER NOTA' : '' })} 
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="chkNotaEdit" style={{ fontSize: '12px', fontWeight: 'bold', color: '#92400e', cursor: 'pointer' }}>
                  Atribuir ao Fornecedor Fantasma: "NAO FAZER NOTA"
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

      {/* CABEÇALHO DO MÓDULO */}
      <div style={{ backgroundColor: '#111', padding: '20px', borderRadius: '20px', color: 'white', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔄 PAINEL DE DEVOLUÇÕES E CRÉDITOS
          </h2>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Gestão integrada com a planilha de produtos</span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setAbaPrincipal('cadastro')}
            style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: abaPrincipal === 'cadastro' ? '#f97316' : '#333', color: '#fff', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
          >
            ➕ Adicionar Crédito / Cobrança
          </button>
          <button 
            onClick={() => { setAbaPrincipal('conferencia'); carregarDados(); }}
            style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: abaPrincipal === 'conferencia' ? '#3b82f6' : '#333', color: '#fff', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
          >
            🔍 Conferência de Registros
          </button>
        </div>
      </div>

      {/* CONTEÚDO DA ABA 1: ADICIONAR CRÉDITO OU COBRANÇA */}
      {abaPrincipal === 'cadastro' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '25px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', borderTop: '8px solid #f97316', marginBottom: '30px' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#111' }}>Cadastrar Novo Registro (Data de Hoje)</h3>

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
            
            {/* LOJA */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: erros.loja ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>Loja Solicitante: *</label>
              <select 
                value={novoCredito.loja_id} 
                onChange={(e) => { setNovoCredito({ ...novoCredito, loja_id: e.target.value }); setErros({ ...erros, loja: false }); }} 
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: erros.loja ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none' }}
              >
                <option value="">Selecione a Loja...</option>
                {lojas.map(l => (
                  <option key={l.id} value={l.codigo_loja}>{l.nome_fantasia}</option>
                ))}
              </select>
              {erros.loja && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Campo obrigatório</span>}
            </div>

            {/* NOME DO PRODUTO */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: erros.produto ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>Nome do Produto: *</label>
              <input 
                type="text" 
                list="lista-produtos-credito"
                placeholder="Digite para buscar o produto..." 
                value={novoCredito.nome_produto} 
                onChange={(e) => { handleProdutoChange(e); setErros({ ...erros, produto: false }); }} 
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: erros.produto ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', outline: 'none', textTransform: 'uppercase' }}
              />
              {erros.produto && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Campo obrigatório</span>}
            </div>

            {/* QUANTIDADE E UNIDADE */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: erros.quantidade ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>
                  {ehDzUnidade ? 'Qtd. de Dúzias: *' : (ehBdjUnidade ? 'Qtd. de Bandejas: *' : 'Quantidade: *')}
                </label>
                <input 
                  type="number" 
                  placeholder="0" 
                  value={novoCredito.e_dz ? novoCredito.unidades_dz : (novoCredito.e_bdj ? novoCredito.unidades_bdj : novoCredito.quantidade)} 
                  onChange={(e) => {
                    if (novoCredito.e_dz) {
                      setNovoCredito({ ...novoCredito, unidades_dz: e.target.value });
                    } else if (novoCredito.e_bdj) {
                      setNovoCredito({ ...novoCredito, unidades_bdj: e.target.value });
                    } else {
                      setNovoCredito({ ...novoCredito, quantidade: e.target.value });
                    }
                    setErros({ ...erros, quantidade: false });
                  }} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: erros.quantidade ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc', textAlign: 'center', fontWeight: 'bold', outline: 'none' }}
                />
                {erros.quantidade && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Obrigatório</span>}
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>Unidade (Banco):</label>
                <input 
                  type="text" 
                  disabled 
                  value={novoCredito.unidade_medida || ''} 
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#e2e8f0', fontWeight: 'bold', color: '#334155', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* SE FOR DÚZIA (DZ), MOSTRA OPÇÃO DE FRACIONAR UNIDADES AVULSAS */}
            {ehDzUnidade && (
              <div style={{ gridColumn: '1 / -1', padding: '12px 15px', backgroundColor: '#fefce8', borderRadius: '10px', border: '1px solid #fde047', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="checkbox" 
                    id="chkDzFracionada" 
                    checked={novoCredito.e_dz} 
                    onChange={(e) => setNovoCredito({ ...novoCredito, e_dz: e.target.checked, unidades_dz: '', preco_duzia: '' })} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="chkDzFracionada" style={{ fontSize: '13px', fontWeight: 'bold', color: '#854d0e', cursor: 'pointer' }}>
                    Cobrar ou creditar unidades avulsas de dentro da dúzia? (Ativa cálculo proporcional por unidade)
                  </label>
                </div>

                {novoCredito.e_dz && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '5px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#713f12', display: 'block', marginBottom: '3px' }}>Qtd. de Unidades Avulsas (Ex: 4 un): *</label>
                      <input 
                        type="number" 
                        placeholder="Ex: 4" 
                        value={novoCredito.unidades_dz} 
                        onChange={(e) => { setNovoCredito({ ...novoCredito, unidades_dz: e.target.value }); setErros({ ...erros, unidades_dz: false }); }} 
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: erros.unidades_dz ? '2px solid #ef4444' : '1px solid #ca8a04', fontSize: '13px', background: '#fff', outline: 'none', fontWeight: 'bold' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#713f12', display: 'block', marginBottom: '3px' }}>💵 Valor da Dúzia Inteira (R$): *</label>
                      <input 
                        type="text" 
                        placeholder="R$ 0,00" 
                        value={novoCredito.preco_duzia} 
                        onChange={(e) => {
                          const fmt = formatarMoedaMascara(e.target.value);
                          setNovoCredito({ ...novoCredito, preco_duzia: fmt });
                          setErros({ ...erros, preco_duzia: false });
                        }} 
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: erros.preco_duzia ? '2px solid #ef4444' : '1px solid #ca8a04', fontSize: '13px', background: '#fff', outline: 'none', fontWeight: 'bold' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SE FOR BANDEJA (BDJ), MOSTRA OPÇÃO DE FRACIONAR BANDEJAS AVULSAS */}
            {ehBdjUnidade && (
              <div style={{ gridColumn: '1 / -1', padding: '12px 15px', backgroundColor: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="checkbox" 
                    id="chkBdjFracionada" 
                    checked={novoCredito.e_bdj} 
                    onChange={(e) => setNovoCredito({ ...novoCredito, e_bdj: e.target.checked, unidades_bdj: '', preco_bdj: '' })} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="chkBdjFracionada" style={{ fontSize: '13px', fontWeight: 'bold', color: '#166534', cursor: 'pointer' }}>
                    Cobrar ou creditar bandejas avulsas de dentro da caixa? (Ativa cálculo proporcional por bandeja)
                  </label>
                </div>

                {novoCredito.e_bdj && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '5px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#166534', display: 'block', marginBottom: '3px' }}>Qtd. de Bandejas Avulsas (Ex: 2 bdj): *</label>
                      <input 
                        type="number" 
                        placeholder="Ex: 2" 
                        value={novoCredito.unidades_bdj} 
                        onChange={(e) => { setNovoCredito({ ...novoCredito, unidades_bdj: e.target.value }); setErros({ ...erros, unidades_bdj: false }); }} 
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: erros.unidades_bdj ? '2px solid #ef4444' : '1px solid #16a34a', fontSize: '13px', background: '#fff', outline: 'none', fontWeight: 'bold' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#166534', display: 'block', marginBottom: '3px' }}>💵 Valor da Caixa Inteira com as Bandejas (R$): *</label>
                      <input 
                        type="text" 
                        placeholder="R$ 0,00" 
                        value={novoCredito.preco_bdj} 
                        onChange={(e) => {
                          const fmt = formatarMoedaMascara(e.target.value);
                          setNovoCredito({ ...novoCredito, preco_bdj: fmt });
                          setErros({ ...erros, preco_bdj: false });
                        }} 
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', border: erros.preco_bdj ? '2px solid #ef4444' : '1px solid #16a34a', fontSize: '13px', background: '#fff', outline: 'none', fontWeight: 'bold' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* BOTÃO PERCA EM KG */}
            <div style={{ gridColumn: '1 / -1', padding: '10px 15px', backgroundColor: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input 
                type="checkbox" 
                id="chkPercaKg" 
                checked={novoCredito.e_kg} 
                onChange={(e) => setNovoCredito({ ...novoCredito, e_kg: e.target.checked })} 
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="chkPercaKg" style={{ fontSize: '13px', fontWeight: 'bold', color: '#166534', cursor: 'pointer' }}>
                Perca em KG? (Ativa cálculo por peso de caixa e seleção avançada)
              </label>
            </div>

            {alertaSemPeso && (
              <div style={{ gridColumn: '1 / -1', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #f87171', borderRadius: '10px', color: '#991b1b', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠️</span> Alerta: Este produto não tem peso de caixa cadastrado na planilha! Informe o peso da caixa abaixo.
              </div>
            )}

            {novoCredito.e_kg && (
              <>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: erros.peso_cx ? '#ef4444' : '#16a34a', display: 'block', marginBottom: '5px' }}>📦 Peso da Caixa (KG): *</label>
                  <input 
                    type="number" 
                    placeholder="Ex: 20" 
                    value={novoCredito.peso_cx_padrao} 
                    onChange={(e) => { setNovoCredito({ ...novoCredito, peso_cx_padrao: e.target.value }); setErros({ ...erros, peso_cx: false }); }} 
                    style={{ width: '100%', padding: '10px', borderRadius: '10px', border: erros.peso_cx ? '2px solid #ef4444' : '1px solid #16a34a', fontSize: '14px', background: '#f0fdf4', outline: 'none', fontWeight: 'bold' }}
                  />
                  {erros.peso_cx && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Peso obrigatório</span>}
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: erros.preco_caixa ? '#ef4444' : '#16a34a', display: 'block', marginBottom: '5px' }}>💵 Preço da Caixa (R$): *</label>
                  <input 
                    type="text" 
                    placeholder="R$ 0,00" 
                    value={novoCredito.preco_caixa} 
                    onChange={(e) => {
                      const fmt = formatarMoedaMascara(e.target.value);
                      setNovoCredito({ ...novoCredito, preco_caixa: fmt });
                      setErros({ ...erros, preco_caixa: false });
                    }} 
                    style={{ width: '100%', padding: '10px', borderRadius: '10px', border: erros.preco_caixa ? '2px solid #ef4444' : '1px solid #16a34a', fontSize: '14px', background: '#f0fdf4', outline: 'none', fontWeight: 'bold' }}
                  />
                  {erros.preco_caixa && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Preço da caixa obrigatório</span>}
                </div>
              </>
            )}

            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: erros.fornecedor ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>Fornecedor Entregador: *</label>
              <input 
                type="text" 
                list="lista-fornecedores-credito"
                disabled={novoCredito.nao_fazer_nota}
                placeholder={novoCredito.nao_fazer_nota ? "Atribuido para NAO FAZER NOTA" : "Digite para buscar o fornecedor..."} 
                value={novoCredito.fornecedor} 
                onChange={(e) => { setNovoCredito({ ...novoCredito, fornecedor: removerAcentos(e.target.value).toUpperCase() }); setErros({ ...erros, fornecedor: false }); }} 
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: erros.fornecedor ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: novoCredito.nao_fazer_nota ? '#e2e8f0' : '#f8fafc', outline: 'none' }}
              />
              {erros.fornecedor && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Fornecedor obrigatório</span>}
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: erros.valor_unit ? '#ef4444' : '#475569', display: 'block', marginBottom: '5px' }}>
                {novoCredito.e_kg && pesoCxNum > 0 && precoCxNum > 0 ? 'Valor Unitário (Calculado por KG):' : (novoCredito.e_dz && precoDuziaNum > 0 ? 'Valor Unitário (Calculado por Unidade): *' : (novoCredito.e_bdj && precoBdjNum > 0 ? 'Valor Unitário (Calculado por Bandeja): *' : 'Valor Unitário (R$): *'))}
              </label>
              <input 
                type="text" 
                placeholder="R$ 0,00" 
                value={
                  novoCredito.e_kg && pesoCxNum > 0 && precoCxNum > 0 
                    ? `R$ ${valNum.toFixed(2).replace('.', ',')}` 
                    : (novoCredito.e_dz && precoDuziaNum > 0 
                        ? `R$ ${valNum.toFixed(2).replace('.', ',')}` 
                        : (novoCredito.e_bdj && precoBdjNum > 0 
                            ? `R$ ${valNum.toFixed(2).replace('.', ',')}` 
                            : novoCredito.valor_unit))
                } 
                disabled={(novoCredito.e_kg && pesoCxNum > 0 && precoCxNum > 0) || (novoCredito.e_dz && precoDuziaNum > 0) || (novoCredito.e_bdj && precoBdjNum > 0)}
                onChange={(e) => {
                  const fmt = formatarMoedaMascara(e.target.value);
                  setNovoCredito({ ...novoCredito, valor_unit: fmt });
                  setErros({ ...erros, valor_unit: false });
                }} 
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: erros.valor_unit ? '2px solid #ef4444' : '1px solid #cbd5e1', fontSize: '14px', background: (novoCredito.e_kg && pesoCxNum > 0 && precoCxNum > 0) || (novoCredito.e_dz && precoDuziaNum > 0) || (novoCredito.e_bdj && precoBdjNum > 0) ? '#e2e8f0' : '#f8fafc', outline: 'none' }}
              />
              {erros.valor_unit && <span style={{ fontSize: '10px', color: '#ef4444', display: 'block', marginTop: '2px', fontWeight: 'bold' }}>Valor unitário obrigatório em números</span>}
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
              onChange={(e) => { setNovoCredito({ ...novoCredito, nao_fazer_nota: e.target.checked }); setErros({ ...erros, fornecedor: false }); }} 
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label htmlFor="chkNotaCredito" style={{ fontSize: '12px', fontWeight: 'bold', color: '#92400e', cursor: 'pointer' }}>
              Atribuir ao Fornecedor Fantasma: "NAO FAZER NOTA" (Desconto direto sem nota fiscal)
            </label>
          </div>

          <button 
            onClick={salvarCredito} 
            style={{ width: '100%', marginTop: '20px', padding: '15px', backgroundColor: '#f97316', color: 'white', border: 'none', borderRadius: '15px', fontWeight: '900', cursor: 'pointer', fontSize: '15px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
          >
            <span>💾</span> SALVAR REGISTRO PARA PROCESSAMENTO (DATA DE HOJE)
          </button>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: CONFERÊNCIA DE REGISTROS (COM CALENDÁRIO E VISUAL NEUTRO IDÊNTICO AO CADASTRO) */}
      {abaPrincipal === 'conferencia' && (
        <div style={{ backgroundColor: '#fff', borderRadius: '24px', padding: '25px', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', borderTop: '8px solid #3b82f6', marginBottom: '30px' }}>
          
          {/* BARRA COM O CALENDÁRIO DE FILTRO DE DATA */}
          <div style={{ backgroundColor: '#f8fafc', padding: '15px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155' }}>📅 Selecione a Data para Conferência:</span>
              <input 
                type="date" 
                value={dataFiltro} 
                onChange={(e) => setDataFiltro(e.target.value)}
                style={{ background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', fontSize: '14px', outline: 'none', fontWeight: 'bold', cursor: 'pointer' }}
              />
            </div>
            <button onClick={() => carregarDados()} style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>🔄 Atualizar Lista</button>
          </div>

          {/* ABAS DE STATUS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '16px' }}>Registros Salvos em {dataFiltro.split('-').reverse().join('/')}</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => setAbaCreditos('pendentes')}
                style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: abaCreditos === 'pendentes' ? '#f97316' : '#f1f5f9', color: abaCreditos === 'pendentes' ? '#fff' : '#475569', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
              >
                ⏳ Pendentes ({creditos.filter(c => c.status !== 'resolvido').length})
              </button>
              <button 
                onClick={() => setAbaCreditos('feitos')}
                style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', background: abaCreditos === 'feitos' ? '#22c55e' : '#f1f5f9', color: abaCreditos === 'feitos' ? '#fff' : '#475569', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
              >
                ✅ Feitos ({creditos.filter(c => c.status === 'resolvido').length})
              </button>
            </div>
          </div>

          <div>
            {creditosFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                Nenhum registro encontrado nesta aba para a data selecionada ({dataFiltro.split('-').reverse().join('/')}).
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {creditosFiltrados.map((c, i) => {
                  const lojaObj = lojas.find(l => String(l.codigo_loja) === String(c.loja_id));
                  const nomeLoja = lojaObj ? lojaObj.nome_fantasia : `Loja ${c.loja_id}`;
                  const resolvido = c.status === 'resolvido';
                  const isCobranca = String(c.nome_produto || '').includes('[COBRANCA]') || String(c.nome_produto || '').includes('[COBRANÇA]');
                  const nomeProdutoLimpo = isCobranca ? c.nome_produto.replace('[COBRANCA]', '').replace('[COBRANÇA]', '').trim() : c.nome_produto;

                  const pUnitItem = parseFloat(String(c.valor_unit || '0').replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0;
                  const totalItemCalc = Number(c.quantidade || 0) * pUnitItem;

                  return (
                    <div key={c.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: resolvido ? '#f1f5f9' : (isCobranca ? '#fef2f2' : '#f8fafc'), borderRadius: '14px', border: isCobranca ? '1px solid #fca5a5' : '1px solid #e2e8f0', opacity: resolvido ? 0.7 : 1, flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: '260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '10px', fontWeight: '900', padding: '2px 8px', borderRadius: '6px', background: isCobranca ? '#fee2e2' : '#dcfce7', color: isCobranca ? '#991b1b' : '#166534' }}>
                            {isCobranca ? '⚠️ COBRANÇA DE LOJA' : '🔄 CRÉDITO / DEVOLUÇÃO'}
                          </span>
                        </div>

                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', marginBottom: '4px' }}>
                          <span style={{ color: '#2563eb', marginRight: '6px' }}>{nomeLoja}</span> - <span style={{ textTransform: 'uppercase' }}>{nomeProdutoLimpo}</span>
                        </div>

                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#d97706', marginBottom: '6px' }}>
                          Fornecedor: {c.fornecedor}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
                          <span>Qtd/Unidade: <b style={{ color: '#64748b' }}>{c.quantidade} {c.unidade_medida}</b></span>
                          <span>•</span>
                          <span>Unit: <b style={{ color: '#64748b' }}>{c.valor_unit}</b></span>
                        </div>
                      </div>

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
      )}

    </div>
  );
}