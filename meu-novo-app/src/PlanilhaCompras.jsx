import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

export default function PlanilhaCompras() {
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(() => localStorage.getItem('virtus_data_filtro') || obterDataLocal());
  const dataBr = dataFiltro.split('-').reverse().join('/');

  const [abaAtiva, setAbaAtiva] = useState('pendentes'); 
  const [carregando, setCarregando] = useState(true);
  const [buscaPendentes, setBuscaPendentes] = useState('');
  const [buscaFornecedores, setBuscaFornecedores] = useState('');

  const [demandas, setDemandas] = useState([]); 
  const [pedidosFeitos, setPedidosFeitos] = useState([]); 
  const [pedidosRaw, setPedidosRaw] = useState([]); 
  const [fornecedoresBd, setFornecedoresBd] = useState([]); // Cadastro oficial do banco
  const [fornecedoresAtivos, setFornecedoresAtivos] = useState([]); // Lançamentos do dia
  const [lojasBd, setLojasBd] = useState([]);
  
  const [itemModal, setItemModal] = useState(null);
  const [abaModal, setAbaModal] = useState('completo'); 
  const [dadosCompra, setDadosCompra] = useState({ fornecedor: '', valor_unit: '', qtd_pedir: '', isFaltaGeral: false });
  const [lojasEnvolvidas, setLojasEnvolvidas] = useState([]);

  const [fornExpandido, setFornExpandido] = useState(null);
  const [localCompra, setLocalCompra] = useState(''); 
  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [nomeFornecedorLote, setNomeFornecedorLote] = useState('');
  const [agrupamentos, setAgrupamentos] = useState(() => {
    const salvo = localStorage.getItem(`agrupamentos_virtus_${dataFiltro}`);
    return salvo ? JSON.parse(salvo) : [];
  });

  // Estado para editar nome do fornecedor
  const [editandoNomeForn, setEditandoNomeForn] = useState(null);
  const [novoNomeForn, setNovoNomeForn] = useState('');

  const removerAcentos = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

  // 💡 VERIFICA SE O FORNECEDOR EXISTE NO BANCO
  const fornecedorTemCadastro = (nome) => {
    if (!nome) return false;
    const n = removerAcentos(nome);
    return fornecedoresBd.some(f => removerAcentos(f.nome_fantasia) === n || removerAcentos(f.nome_completo) === n);
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      // 1. Puxar cadastro oficial de fornecedores
      const { data: fDB } = await supabase.from('fornecedores').select('nome_fantasia, nome_completo').order('nome_fantasia');
      setFornecedoresBd(fDB || []);

      const { data: lojasData } = await supabase.from('lojas').select('*');
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro);
      setPedidosRaw(pedData || []);
      
      const mapaPendentes = {};
      const mapaFeitos = {};
      const mapaForn = {};

      (pedData || []).forEach(p => {
        if (p.bloqueado) return;
        const idLoja = p.loja_id;
        const nomeProduto = String(p.nome_produto || "").toUpperCase();

        if (p.status_compra === 'pendente') {
          if (!mapaPendentes[nomeProduto]) {
            mapaPendentes[nomeProduto] = { nome: nomeProduto, demanda: 0, lojas: [] };
          }
          mapaPendentes[nomeProduto].demanda += Number(p.quantidade);
          mapaPendentes[nomeProduto].lojas.push(p);
        } else if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
          let fNome = String(p.fornecedor_compra || 'SEM NOME').toUpperCase();
          if (!mapaForn[fNome]) {
            mapaForn[fNome] = { nome: fNome, totalGeral: 0, lojas: {}, temCadastro: fornecedorTemCadastro(fNome) };
          }
          const lojaInfo = (lojasData || []).find(l => l.codigo_loja == p.loja_id);
          const nLoja = lojaInfo ? lojaInfo.nome_fantasia : `Loja ${p.loja_id}`;
          
          if (!mapaForn[fNome].lojas[nLoja]) mapaForn[fNome].lojas[nLoja] = { itens: [] };
          
          const vUnit = parseFloat(String(p.custo_unit).replace('R$', '').replace(',', '.')) || 0;
          const totalItem = (p.qtd_atendida - (p.qtd_bonificada || 0)) * vUnit;
          
          mapaForn[fNome].lojas[nLoja].itens.push({ ...p, totalItem });
          mapaForn[fNome].totalGeral += totalItem;
        }
      });

      setDemandas(Object.values(mapaPendentes));
      setFornecedoresAtivos(Object.values(mapaForn));
    } catch (e) { console.error(e); }
    finally { setCarregando(false); }
  }, [dataFiltro, fornecedoresBd.length]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // 💡 FUNÇÃO PARA CANCELAR APENAS UM ITEM DO PEDIDO
  const cancelarItemUnico = async (idPedido, nomeItem) => {
    if (!window.confirm(`Deseja cancelar apenas o item "${nomeItem}"? Ele voltará para os PENDENTES.`)) return;
    setCarregando(true);
    await supabase.from('pedidos').update({
      status_compra: 'pendente',
      fornecedor_compra: '',
      custo_unit: '',
      qtd_atendida: 0,
      qtd_bonificada: 0
    }).eq('id', idPedido);
    carregarDados();
  };

  // 💡 FUNÇÃO PARA EDITAR O NOME DO FORNECEDOR EM TODOS OS PEDIDOS DO DIA
  const salvarNovoNomeFornecedor = async () => {
    if (!novoNomeForn.trim()) return;
    setCarregando(true);
    await supabase.from('pedidos')
      .update({ fornecedor_compra: novoNomeForn.toUpperCase().trim() })
      .eq('data_pedido', dataFiltro)
      .eq('fornecedor_compra', editandoNomeForn);
    
    setEditandoNomeForn(null);
    carregarDados();
  };

  return (
    <div style={{ padding: '10px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      
      {/* DATALIST GLOBAL */}
      <datalist id="lista-fornecedores">
        {fornecedoresBd.map((f, i) => (
          <option key={i} value={f.nome_fantasia || f.nome_completo} />
        ))}
      </datalist>

      {/* HEADER E ABAS (Simplificado para o exemplo) */}
      <div style={{ background: '#111', color: '#fff', padding: '20px', borderRadius: '15px', marginBottom: '15px' }}>
        <h2 style={{ margin: 0 }}>V.I.R.T.U.S - COMPRAS</h2>
        <input type="date" value={dataFiltro} onChange={e => setDataFiltro(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <button onClick={() => setAbaAtiva('pendentes')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: abaAtiva === 'pendentes' ? '#f97316' : '#eee' }}>PENDENTES</button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: abaAtiva === 'fornecedores' ? '#111' : '#eee', color: abaAtiva === 'fornecedores' ? '#fff' : '#000' }}>FORNECEDORES</button>
      </div>

      {abaAtiva === 'fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {fornecedoresAtivos.map(f => (
            <div key={f.nome} style={{ background: '#fff', padding: '15px', borderRadius: '12px', border: f.temCadastro ? '1px solid #e2e8f0' : '2px solid #ef4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {editandoNomeForn === f.nome ? (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <input list="lista-fornecedores" value={novoNomeForn} onChange={e => setNovoNomeForn(e.target.value)} style={{ padding: '5px', textTransform: 'uppercase' }} />
                      <button onClick={salvarNovoNomeFornecedor} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '5px' }}>✅</button>
                      <button onClick={() => setEditandoNomeForn(null)} style={{ background: '#64748b', color: '#fff', border: 'none', padding: '5px' }}>✕</button>
                    </div>
                  ) : (
                    <h3 style={{ margin: 0, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      🏢 {f.nome} 
                      <button onClick={() => { setEditandoNomeForn(f.nome); setNovoNomeForn(f.nome); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>✏️</button>
                      {!f.temCadastro && <span style={{ background: '#ef4444', color: '#fff', fontSize: '9px', padding: '2px 5px', borderRadius: '4px' }}>⚠️ SEM CADASTRO</span>}
                    </h3>
                  )}
                </div>
                <strong style={{ color: '#16a34a' }}>R$ {f.totalGeral.toFixed(2)}</strong>
              </div>

              <div style={{ marginTop: '10px' }}>
                {Object.entries(f.lojas).map(([nomeLoja, dados]) => (
                  <div key={nomeLoja} style={{ padding: '8px', background: '#f8fafc', borderRadius: '6px', marginBottom: '5px', fontSize: '12px' }}>
                    <strong>{nomeLoja}:</strong>
                    {dados.itens.map(it => (
                      <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingLeft: '10px' }}>
                        <span>{it.qtd_atendida}x {it.nome_produto}</span>
                        <button onClick={() => cancelarItemUnico(it.id, it.nome_produto)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✖</button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL DE COMPRA (Placeholder da lógica principal) */}
      {itemModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '15px', width: '100%', maxWidth: '400px' }}>
            <h3>Lançar: {itemModal.nome}</h3>
            <input 
              list="lista-fornecedores" 
              placeholder="NOME DO FORNECEDOR" 
              value={dadosCompra.fornecedor} 
              onChange={e => setDadosCompra({...dadosCompra, fornecedor: e.target.value})}
              style={{ width: '100%', padding: '12px', marginBottom: '10px', textTransform: 'uppercase' }}
            />
            {/* ... Resto dos campos de preço e qtd ... */}
            <button onClick={() => setItemModal(null)} style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', border: 'none', borderRadius: '8px' }}>FECHAR</button>
          </div>
        </div>
      )}

    </div>
  );
}