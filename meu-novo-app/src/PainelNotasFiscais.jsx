import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function PainelNotasFiscais({ isEscuro }) {
  const configDesign = {
    cores: {
      fundoGeral: isEscuro ? '#0f172a' : '#f8fafc',
      fundoCards: isEscuro ? '#1e293b' : '#ffffff',
      textoForte: isEscuro ? '#f8fafc' : '#111111',
      textoSuave: isEscuro ? '#94a3b8' : '#64748b',
      borda: isEscuro ? '#334155' : '#e2e8f0',
      primaria: '#8b5cf6', 
      sucesso: '#22c55e',
      alerta: '#ef4444',
      aviso: '#f59e0b',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9'
    }
  };

  const [abaAtiva, setAbaAtiva] = useState('pedidos_nf');
  const [subAbaNF, setSubAbaNF] = useState('pendentes'); 
  const [carregando, setCarregando] = useState(true);
  
  const [pedidosFornecedor, setPedidosFornecedor] = useState([]);
  const [pedidosLoja, setPedidosLoja] = useState([]);
  const [listaFornecedores, setListaFornecedores] = useState([]);
  
  const [inputsNF, setInputsNF] = useState({});
  const [busca, setBusca] = useState('');

  const [expandidoNF, setExpandidoNF] = useState(null);
  const [expandidoLoja, setExpandidoLoja] = useState(null);
  const [expandidoCad, setExpandidoCad] = useState(null);

  const [modoImpressaoLojas, setModoImpressaoLojas] = useState(false);

  const hoje = new Date().toLocaleDateString('en-CA');
  const dataBr = new Date().toLocaleDateString('pt-BR');

  useEffect(() => {
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const normalizarBusca = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s/g, '').toLowerCase();
  };

  const tratarPrecoNum = (p) => {
    let precoCln = String(p || '0').replace('R$', '').trim();
    if (precoCln.includes('BONIFICAÇÃO |')) precoCln = precoCln.split('|')[1].trim();
    return parseFloat(precoCln.replaceAll('.', '').replace(',', '.')) || 0;
  };

  async function carregarDados() {
    setCarregando(true);
    try {
      const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
      let fornecedoresDB = fornData || [];
      setListaFornecedores(fornecedoresDB);

      const { data: lojasData } = await supabase.from('lojas').select('*');
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', hoje).in('status_compra', ['atendido', 'boleto']);

      const pedidos = pedData || [];
      const lojas = lojasData || [];

      // 1. AGRUPAR POR FORNECEDOR (IGNORANDO MÉDIA E SEPARANDO PREÇOS DIFERENTES)
      const mapaForn = {};
      const initNFs = {};
      
      pedidos.forEach(p => {
        const fNome = String(p.fornecedor_compra || 'DESCONHECIDO').toUpperCase().replace('ALERTA|', '').trim();
        const isBoleto = p.status_compra === 'boleto';

        if (!mapaForn[fNome]) {
          const nomeNormalizadoPed = normalizarBusca(fNome);
          const matches = fornecedoresDB.filter(f => normalizarBusca(f.nome_fantasia) === nomeNormalizadoPed || normalizarBusca(f.nome_completo) === nomeNormalizadoPed);
          
          let infoFornBD = matches.length === 1 ? matches[0] : null;
          const isPJ = infoFornBD?.tipo_documento === 'CNPJ' || (infoFornBD?.cnpj_cpf && infoFornBD.cnpj_cpf.length > 14);

          mapaForn[fNome] = { 
              fornecedor: fNome, 
              statusCadastro: matches.length === 1 ? 'LINKADO' : matches.length > 1 ? 'COLISAO' : 'SEM_CADASTRO',
              dadosCadastro: infoFornBD,
              tipoPessoa: isPJ ? 'PJ' : 'PF', 
              total: 0, 
              nota_fiscal: p.nota_fiscal || '', 
              itensRaw: {} 
          };
          if (p.nota_fiscal) initNFs[fNome] = p.nota_fiscal;
        }

        // 💡 Lógica de custo: Usa apenas o custo_unit original
        let baseVal = p.custo_unit || 'R$ 0,00'; 
        if (String(baseVal).includes('BONIFICAÇÃO |')) baseVal = String(baseVal).split('|')[1].trim();
        const valNum = tratarPrecoNum(baseVal);

        // Chave de agrupamento: Nome + Preço Custo + Boleto (Se o preço mudar, cria linha nova)
        const keyItem = `${p.nome_produto}_${valNum}_${isBoleto}`;

        if (!mapaForn[fNome].itensRaw[keyItem]) {
            mapaForn[fNome].itensRaw[keyItem] = { nome: p.nome_produto, und: p.unidade_medida || 'UN', qtd: 0, qtdBonificada: 0, valNum: valNum, isBoleto: isBoleto };
        }

        const raw = mapaForn[fNome].itensRaw[keyItem];
        raw.qtd += Number(p.qtd_atendida || 0);
        raw.qtdBonificada += Number(p.qtd_bonificada || 0);

        if (p.nota_fiscal && !mapaForn[fNome].nota_fiscal) {
            mapaForn[fNome].nota_fiscal = p.nota_fiscal;
            initNFs[fNome] = p.nota_fiscal;
        }
      });

      Object.values(mapaForn).forEach(forn => {
          Object.values(forn.itensRaw).forEach(raw => {
              const qtdCobrada = Math.max(0, raw.qtd - raw.qtdBonificada);
              const totalItem = qtdCobrada * raw.valNum;
              forn.itens.push({ nome: raw.nome, qtd: raw.qtd, und: raw.und, preco_unit: raw.valNum, total: totalItem, isBoleto: raw.isBoleto });
              forn.total += totalItem;
          });
          delete forn.itensRaw;
      });

      setPedidosFornecedor(Object.values(mapaForn).sort((a,b) => a.fornecedor.localeCompare(b.fornecedor)));
      setInputsNF(initNFs);

      // 2. AGRUPAR POR LOJA (Resumo)
      const mapaLoja = {};
      pedidos.forEach(p => {
        const idLoja = parseInt(String(p.loja_id).match(/\d+/)?.[0]);
        if (!idLoja || idLoja <= 1) return; 
        const lojaInfo = lojas.find(l => parseInt(l.codigo_loja) === idLoja);
        const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia.replace(/^\d+\s*-\s*/, '').trim().toUpperCase() : `LOJA ${idLoja}`;
        if (!mapaLoja[nomeLoja]) mapaLoja[nomeLoja] = { loja: nomeLoja, total: 0, itens: [] };

        const precoRef = p.preco_venda || p.custo_unit || 'R$ 0,00';
        const valNumLoja = tratarPrecoNum(precoRef);
        const totalItemLoja = Math.max(0, (p.qtd_atendida || 0) - (p.qtd_bonificada || 0)) * valNumLoja;

        mapaLoja[nomeLoja].total += totalItemLoja;
        mapaLoja[nomeLoja].itens.push({ nome: p.nome_produto, qtd: p.qtd_atendida, und: p.unidade_medida, preco_unit: valNumLoja, total: totalItemLoja, isBoleto: p.status_compra === 'boleto' });
      });
      setPedidosLoja(Object.values(mapaLoja).sort((a,b) => a.loja.localeCompare(b.loja)));

    } catch (err) { console.error(err); } finally { setCarregando(false); }
  }

  const salvarNotaFiscal = async (fornecedorNome) => {
    const numeroNF = inputsNF[fornecedorNome] || '';
    if (!numeroNF.trim()) return alert("Digite o número da Nota Fiscal.");
    setCarregando(true);
    try {
      const { error } = await supabase.from('pedidos').update({ nota_fiscal: numeroNF }).eq('data_pedido', hoje).ilike('fornecedor_compra', `%${fornecedorNome}%`);
      if (error) throw error;
      alert(`✅ Nota Fiscal salva!`);
      setExpandidoNF(null); 
      carregarDados();
    } catch (err) { alert(err.message); setCarregando(false); }
  };

  const apagarNotaFiscal = async (fornecedorNome) => {
    if (!window.confirm("Apagar nota fiscal e voltar para pendentes?")) return;
    setCarregando(true);
    try {
      const { error } = await supabase.from('pedidos').update({ nota_fiscal: null }).eq('data_pedido', hoje).ilike('fornecedor_compra', `%${fornecedorNome}%`);
      if (error) throw error;
      const novos = {...inputsNF}; delete novos[fornecedorNome]; setInputsNF(novos);
      alert(`🗑️ Nota apagada!`);
      setExpandidoNF(null); 
      carregarDados();
    } catch (err) { alert(err.message); setCarregando(false); }
  };

  const processarPDFLojas = async (modo = 'baixar') => {
     const elemento = document.getElementById('area-impressao-lojas');
     const opt = { margin: [10, 10, 15, 10], filename: `Fechamento_${dataBr}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
     if (modo === 'preview') { const url = await window.html2pdf().set(opt).from(elemento).output('bloburl'); window.open(url, '_blank'); }
     else { window.html2pdf().set(opt).from(elemento).save(); }
  };

  if (carregando && pedidosFornecedor.length === 0) return <div style={{ padding: '50px', textAlign: 'center' }}>🔄 Carregando...</div>;

  return (
    <div style={{ fontFamily: 'sans-serif', paddingBottom: '50px' }}>
      <div style={{ backgroundColor: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', marginBottom: '20px', border: `1px solid ${configDesign.cores.borda}` }}>
        <h2 style={{ margin: 0, color: configDesign.cores.textoForte }}>Setor Fiscal</h2>
        <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: configDesign.cores.textoSuave }}>Data: {dataBr}</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto' }}>
        <button onClick={() => setAbaAtiva('pedidos_nf')} style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: abaAtiva === 'pedidos_nf' ? configDesign.cores.primaria : configDesign.cores.fundoCards, color: abaAtiva === 'pedidos_nf' ? '#fff' : configDesign.cores.textoSuave }}>📦 NOTAS FISCAIS</button>
        <button onClick={() => setAbaAtiva('fechamento_lojas')} style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: abaAtiva === 'fechamento_lojas' ? configDesign.cores.primaria : configDesign.cores.fundoCards, color: abaAtiva === 'fechamento_lojas' ? '#fff' : configDesign.cores.textoSuave }}>🏪 LOJAS</button>
        <button onClick={() => setAbaAtiva('cadastros')} style={{ padding: '12px 20px', borderRadius: '12px', border: 'none', cursor: 'pointer', backgroundColor: abaAtiva === 'cadastros' ? configDesign.cores.primaria : configDesign.cores.fundoCards, color: abaAtiva === 'cadastros' ? '#fff' : configDesign.cores.textoSuave }}>📇 FORNECEDORES</button>
      </div>

      {abaAtiva === 'pedidos_nf' && (
        <>
          <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
             <button onClick={() => setSubAbaNF('pendentes')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', backgroundColor: subAbaNF === 'pendentes' ? configDesign.cores.aviso : configDesign.cores.fundoCards, color: '#fff' }}>⏳ PENDENTES</button>
             <button onClick={() => setSubAbaNF('concluidos')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', backgroundColor: subAbaNF === 'concluidos' ? configDesign.cores.sucesso : configDesign.cores.fundoCards, color: '#fff' }}>✅ CONCLUÍDOS</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {pedidosFornecedor.filter(f => subAbaNF === 'pendentes' ? !f.nota_fiscal : !!f.nota_fiscal).map(f => (
              <div key={f.fornecedor} style={{ background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '16px', border: `2px solid ${f.nota_fiscal ? configDesign.cores.sucesso : configDesign.cores.aviso}` }}>
                <div onClick={() => setExpandidoNF(expandidoNF === f.fornecedor ? null : f.fornecedor)} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>{f.fornecedor} {f.nota_fiscal && `(NF: ${f.nota_fiscal})`}</h3>
                  <strong>{formatarMoeda(f.total)}</strong>
                </div>
                {expandidoNF === f.fornecedor && (
                  <div style={{ marginTop: '15px' }}>
                    {f.itens.map((it, i) => <div key={i} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #eee' }}><span>{it.qtd} {it.und} - {it.nome}</span><span>{formatarMoeda(it.preco_unit)} = {formatarMoeda(it.total)}</span></div>)}
                    <div style={{ marginTop: '15px', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '10px', fontWeight: 'bold' }}>NÚMERO DA NOTA FISCAL</label>
                        <input type="text" value={inputsNF[f.fornecedor] || ''} onChange={e => setInputsNF({...inputsNF, [f.fornecedor]: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
                      </div>
                      <button onClick={() => salvarNotaFiscal(f.fornecedor)} style={{ background: configDesign.cores.sucesso, color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>{f.nota_fiscal ? '🔄 ATUALIZAR' : '💾 SALVAR'}</button>
                      {f.nota_fiscal && <button onClick={() => apagarNotaFiscal(f.fornecedor)} style={{ background: configDesign.cores.alerta, color: '#fff', border: 'none', padding: '10px 15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>🗑️ APAGAR</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {abaAtiva === 'fechamento_lojas' && (
        <div id="area-impressao-lojas" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <button onClick={() => processarPDFLojas()} className="no-print" style={{ padding: '10px', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>📥 BAIXAR RESUMO LOJAS</button>
          {pedidosLoja.map(l => (
            <div key={l.loja} style={{ background: '#fff', padding: '15px', borderRadius: '12px', border: '1px solid #eee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{l.loja}</strong><strong>{formatarMoeda(l.total)}</strong></div>
              {l.itens.map((it, i) => <div key={i} style={{ fontSize: '11px', color: '#666' }}>{it.qtd}x {it.nome} - {formatarMoeda(it.total)}</div>)}
            </div>
          ))}
        </div>
      )}

      {abaAtiva === 'cadastros' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
          {listaFornecedores.map(f => (
            <div key={f.id} style={{ background: '#fff', padding: '15px', borderRadius: '12px', border: '1px solid #eee' }}>
              <strong style={{ fontSize: '14px' }}>{f.nome_fantasia}</strong>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>PIX: {f.chave_pix}<br/>CNPJ/CPF: {f.cnpj_cpf}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}