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
      primaria: '#8b5cf6', // Roxo fiscal para diferenciar
      sucesso: '#22c55e',
      alerta: '#ef4444',
      inputFundo: isEscuro ? '#0f172a' : '#f1f5f9'
    }
  };

  const [abaAtiva, setAbaAtiva] = useState('pedidos_nf');
  const [carregando, setCarregando] = useState(true);
  
  const [pedidosFornecedor, setPedidosFornecedor] = useState([]);
  const [pedidosLoja, setPedidosLoja] = useState([]);
  const [listaFornecedores, setListaFornecedores] = useState([]);
  
  const [inputsNF, setInputsNF] = useState({});
  const [busca, setBusca] = useState('');

  const hoje = new Date().toLocaleDateString('en-CA');
  const dataBr = new Date().toLocaleDateString('pt-BR');

  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const tratarPrecoNum = (p) => {
    let precoCln = String(p || '0').replace('R$', '').trim();
    if (precoCln.includes('BONIFICAÇÃO |')) precoCln = precoCln.split('|')[1].trim();
    return parseFloat(precoCln.replaceAll('.', '').replace(',', '.')) || 0;
  };

  async function carregarDados() {
    setCarregando(true);
    try {
      const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
      setListaFornecedores(fornData || []);

      const { data: lojasData } = await supabase.from('lojas').select('*');

      const { data: pedData } = await supabase.from('pedidos')
        .select('*')
        .eq('data_pedido', hoje)
        .in('status_compra', ['atendido', 'boleto']);

      const pedidos = pedData || [];
      const lojas = lojasData || [];

      // 1. AGRUPAR POR FORNECEDOR
      const mapaForn = {};
      const initNFs = {};
      
      pedidos.forEach(p => {
        const fNome = String(p.fornecedor_compra || 'DESCONHECIDO').toUpperCase();
        if (!mapaForn[fNome]) {
          mapaForn[fNome] = { fornecedor: fNome, total: 0, nota_fiscal: p.nota_fiscal || '', itens: [] };
          if (p.nota_fiscal) initNFs[fNome] = p.nota_fiscal;
        }

        const valNum = tratarPrecoNum(p.custo_unit);
        const qtd = Number(p.qtd_atendida || 0);
        const totalItem = valNum * qtd;

        mapaForn[fNome].total += totalItem;
        mapaForn[fNome].itens.push({
          nome: p.nome_produto,
          qtd: qtd,
          und: p.unidade_medida,
          preco_unit: valNum,
          total: totalItem,
          isBoleto: p.status_compra === 'boleto'
        });

        // Atualiza a NF se achar alguma preenchida nos itens
        if (p.nota_fiscal && !mapaForn[fNome].nota_fiscal) {
            mapaForn[fNome].nota_fiscal = p.nota_fiscal;
            initNFs[fNome] = p.nota_fiscal;
        }
      });

      setPedidosFornecedor(Object.values(mapaForn).sort((a,b) => a.fornecedor.localeCompare(b.fornecedor)));
      setInputsNF(initNFs);

      // 2. AGRUPAR POR LOJA
      const mapaLoja = {};
      pedidos.forEach(p => {
        const idLoja = parseInt(String(p.loja_id).match(/\d+/)?.[0]);
        if (!idLoja || idLoja <= 1) return; // Ignora loja Frazão Teste ou nulas no fechamento

        const lojaInfo = lojas.find(l => parseInt(l.codigo_loja) === idLoja);
        const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia.replace(/^\d+\s*-\s*/, '').trim().toUpperCase() : `LOJA ${idLoja}`;

        if (!mapaLoja[nomeLoja]) {
          mapaLoja[nomeLoja] = { loja: nomeLoja, total: 0, itens: [] };
        }

        const valNum = tratarPrecoNum(p.custo_unit);
        const qtd = Number(p.qtd_atendida || 0);
        const totalItem = valNum * qtd;

        mapaLoja[nomeLoja].total += totalItem;
        mapaLoja[nomeLoja].itens.push({
          nome: p.nome_produto,
          qtd: qtd,
          und: p.unidade_medida,
          total: totalItem
        });
      });

      setPedidosLoja(Object.values(mapaLoja).sort((a,b) => a.loja.localeCompare(b.loja)));

    } catch (err) {
      console.error(err);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const salvarNotaFiscal = async (fornecedorNome) => {
    const numeroNF = inputsNF[fornecedorNome] || '';
    if (!numeroNF.trim()) return alert("Digite o número da Nota Fiscal antes de salvar.");

    setCarregando(true);
    try {
      const { error } = await supabase.from('pedidos')
        .update({ nota_fiscal: numeroNF })
        .eq('data_pedido', hoje)
        .eq('fornecedor_compra', fornecedorNome);
      
      if (error) throw error;
      
      alert(`✅ Nota Fiscal do fornecedor ${fornecedorNome} salva com sucesso!`);
      carregarDados();
    } catch (err) {
      alert("Erro ao salvar NF: " + err.message);
      setCarregando(false);
    }
  };

  if (carregando && pedidosFornecedor.length === 0) return <div style={{ padding: '50px', textAlign: 'center', color: configDesign.cores.textoSuave }}>🔄 Carregando Painel Fiscal...</div>;

  return (
    <div style={{ fontFamily: 'sans-serif', paddingBottom: '50px' }}>
      
      <div style={{ backgroundColor: configDesign.cores.fundoCards, padding: '20px', borderRadius: '20px', marginBottom: '20px', border: `1px solid ${configDesign.cores.borda}` }}>
        <h2 style={{ margin: 0, fontSize: '20px', color: configDesign.cores.textoForte, display: 'flex', alignItems: 'center', gap: '10px' }}>
          🧾 SETOR FISCAL <span style={{fontSize: '12px', background: configDesign.cores.primaria, color: '#fff', padding: '4px 8px', borderRadius: '8px'}}>LEITURA</span>
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: configDesign.cores.textoSuave }}>Data Base: {dataBr}</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
        <button onClick={() => setAbaAtiva('pedidos_nf')} style={{ flexShrink: 0, padding: '12px 20px', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'pedidos_nf' ? configDesign.cores.primaria : configDesign.cores.fundoCards, color: abaAtiva === 'pedidos_nf' ? '#fff' : configDesign.cores.textoSuave }}>
          📦 LANÇAR N.F. (FORNECEDORES)
        </button>
        <button onClick={() => setAbaAtiva('fechamento_lojas')} style={{ flexShrink: 0, padding: '12px 20px', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'fechamento_lojas' ? configDesign.cores.primaria : configDesign.cores.fundoCards, color: abaAtiva === 'fechamento_lojas' ? '#fff' : configDesign.cores.textoSuave }}>
          🏪 RESUMO DE LOJAS
        </button>
        <button onClick={() => setAbaAtiva('cadastros')} style={{ flexShrink: 0, padding: '12px 20px', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', backgroundColor: abaAtiva === 'cadastros' ? configDesign.cores.primaria : configDesign.cores.fundoCards, color: abaAtiva === 'cadastros' ? '#fff' : configDesign.cores.textoSuave }}>
          📇 DADOS DOS FORNECEDORES
        </button>
      </div>

      <div style={{ backgroundColor: configDesign.cores.fundoCards, borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: `1px solid ${configDesign.cores.borda}`, marginBottom: '20px' }}>
        <span>🔍</span><input placeholder="Buscar na aba atual..." value={busca} onChange={e => setBusca(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px', color: configDesign.cores.textoForte }} />
      </div>

      {/* ================================================================= */}
      {/* ABA 1: FORNECEDORES E NOTA FISCAL */}
      {/* ================================================================= */}
      {abaAtiva === 'pedidos_nf' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {pedidosFornecedor.filter(f => f.fornecedor.toLowerCase().includes(busca.toLowerCase())).map(f => (
             <div key={f.fornecedor} style={{ background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '16px', border: `1px solid ${configDesign.cores.borda}`, boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                   <h3 style={{ margin: 0, color: configDesign.cores.textoForte, fontSize: '16px' }}>🏢 {f.fornecedor}</h3>
                   <strong style={{ color: configDesign.cores.sucesso, fontSize: '18px' }}>{formatarMoeda(f.total)}</strong>
                </div>

                <div style={{ background: configDesign.cores.fundoGeral, padding: '15px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px' }}>
                   {f.itens.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: configDesign.cores.textoForte, borderBottom: `1px dashed ${configDesign.cores.borda}`, paddingBottom: '5px' }}>
                         <span>{item.qtd} {item.und} - <b>{item.nome}</b> {item.isBoleto && <span style={{color: configDesign.cores.alerta}}>(B)</span>}</span>
                         <span>{formatarMoeda(item.preco_unit)} = <b>{formatarMoeda(item.total)}</b></span>
                      </div>
                   ))}
                </div>

                {/* 💡 ÁREA DE LANÇAMENTO DA NOTA FISCAL */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: isEscuro ? '#1e1e1e' : '#fffbeb', padding: '15px', borderRadius: '12px', border: `1px solid ${isEscuro ? '#333' : '#fde68a'}` }}>
                   <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', color: configDesign.cores.textoSuave, marginBottom: '5px' }}>NÚMERO DA NOTA FISCAL</label>
                      <input 
                         type="text" 
                         value={inputsNF[f.fornecedor] || ''} 
                         onChange={(e) => setInputsNF({...inputsNF, [f.fornecedor]: e.target.value})} 
                         placeholder="Ex: NF-123456" 
                         style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${configDesign.cores.borda}`, outline: 'none', background: configDesign.cores.fundoCards, color: configDesign.cores.textoForte, fontWeight: 'bold', boxSizing: 'border-box' }}
                      />
                   </div>
                   <button onClick={() => salvarNotaFiscal(f.fornecedor)} style={{ background: configDesign.cores.primaria, color: '#fff', border: 'none', padding: '0 20px', height: '42px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '18px' }}>
                      💾 SALVAR NF
                   </button>
                </div>
                {f.nota_fiscal && <div style={{ fontSize: '11px', color: configDesign.cores.sucesso, fontWeight: 'bold', marginTop: '8px', textAlign: 'right' }}>✅ NF {f.nota_fiscal} vinculada a este pedido.</div>}
             </div>
          ))}
          {pedidosFornecedor.length === 0 && <div style={{textAlign: 'center', padding: '30px', color: configDesign.cores.textoSuave}}>Nenhum pedido processado hoje.</div>}
        </div>
      )}

      {/* ================================================================= */}
      {/* ABA 2: FECHAMENTO DE LOJAS (VISÃO GERAL) */}
      {/* ================================================================= */}
      {abaAtiva === 'fechamento_lojas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {pedidosLoja.filter(l => l.loja.toLowerCase().includes(busca.toLowerCase())).map(l => (
             <div key={l.loja} style={{ background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '16px', border: `1px solid ${configDesign.cores.borda}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                   <h3 style={{ margin: 0, color: configDesign.cores.textoForte, fontSize: '16px' }}>🏪 {l.loja}</h3>
                   <strong style={{ color: configDesign.cores.alerta, fontSize: '18px' }}>{formatarMoeda(l.total)}</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                   {l.itens.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: configDesign.cores.textoSuave, borderBottom: `1px dashed ${configDesign.cores.borda}`, paddingBottom: '5px' }}>
                         <span>{item.qtd} {item.und} - {item.nome}</span>
                         <span>{formatarMoeda(item.total)}</span>
                      </div>
                   ))}
                </div>
             </div>
          ))}
          {pedidosLoja.length === 0 && <div style={{textAlign: 'center', padding: '30px', color: configDesign.cores.textoSuave}}>Nenhum fechamento de loja disponível.</div>}
        </div>
      )}

      {/* ================================================================= */}
      {/* ABA 3: CADASTRO DE FORNECEDORES */}
      {/* ================================================================= */}
      {abaAtiva === 'cadastros' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
          {listaFornecedores.filter(f => f.nome_fantasia.toLowerCase().includes(busca.toLowerCase())).map(f => (
             <div key={f.id} style={{ background: configDesign.cores.fundoCards, padding: '20px', borderRadius: '16px', border: `1px solid ${configDesign.cores.borda}` }}>
                <h3 style={{ margin: '0 0 15px 0', color: configDesign.cores.textoForte, fontSize: '15px' }}>🏢 {f.nome_fantasia}</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: configDesign.cores.textoSuave }}>
                   <div><strong style={{color: configDesign.cores.textoForte}}>Razão Social:</strong> {f.razao_social || 'Não informado'}</div>
                   <div><strong style={{color: configDesign.cores.textoForte}}>CNPJ/CPF:</strong> {f.cnpj_cpf || 'Não informado'}</div>
                   <div><strong style={{color: configDesign.cores.textoForte}}>Chave PIX:</strong> <span style={{color: configDesign.cores.sucesso, fontWeight: 'bold'}}>{f.chave_pix || 'Não cadastrada'}</span> ({f.tipo_chave_pix || 'N/A'})</div>
                   <div><strong style={{color: configDesign.cores.textoForte}}>Titular PIX:</strong> {f.nome_titular_pix || 'Não informado'}</div>
                   <hr style={{ border: `0.5px dashed ${configDesign.cores.borda}`, margin: '5px 0' }} />
                   <div><strong style={{color: configDesign.cores.textoForte}}>Telefone:</strong> {f.telefone || 'Não informado'}</div>
                   <div><strong style={{color: configDesign.cores.textoForte}}>Endereço:</strong> {f.endereco || 'Não informado'}</div>
                   <div><strong style={{color: configDesign.cores.textoForte}}>Vendedor:</strong> {f.nome_vendedor || 'Não informado'}</div>
                </div>
             </div>
          ))}
          {listaFornecedores.length === 0 && <div style={{gridColumn: '1/-1', textAlign: 'center', padding: '30px', color: configDesign.cores.textoSuave}}>Nenhum fornecedor cadastrado.</div>}
        </div>
      )}

    </div>
  );
}