import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

export default function PlanilhaCompras() {
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(() => {
    return localStorage.getItem('virtus_data_filtro') || obterDataLocal();
  });
  const dataBr = dataFiltro.split('-').reverse().join('/');

  const [abaAtiva, setAbaAtiva] = useState('pendentes'); 
  const [carregando, setCarregando] = useState(true);
  
  const [buscaPendentes, setBuscaPendentes] = useState('');
  const [buscaFeitos, setBuscaFeitos] = useState('');
  const [buscaFornecedores, setBuscaFornecedores] = useState('');
  const [buscaFornList, setBuscaFornList] = useState(''); 
  const [buscaSelecionar, setBuscaSelecionar] = useState(''); 

  const [demandas, setDemandas] = useState([]); 
  const [pedidosFeitos, setPedidosFeitos] = useState([]); 
  const [pedidosRaw, setPedidosRaw] = useState([]); 
  const [fornecedoresBd, setFornecedoresBd] = useState([]);
  const [lojasBd, setLojasBd] = useState([]);
  
  const [listaGeralItens, setListaGeralItens] = useState([]);
  const [itemResumoExpandido, setItemResumoExpandido] = useState(null);
  const [modoImpressaoResumo, setModoImpressaoResumo] = useState(false);

  const [itemModal, setItemModal] = useState(null);
  const [abaModal, setAbaModal] = useState('completo'); 
  
  const [dadosCompra, setDadosCompra] = useState({ 
    fornecedor: '', valor_unit: '', qtd_pedir: '', isFaltaGeral: false, qtdFornecedor: '', temBonificacao: false 
  });
  const [lojasEnvolvidas, setLojasEnvolvidas] = useState([]);

  const [fornExpandido, setFornExpandido] = useState(null);
  const [lojaGeralSelecionada, setLojaGeralSelecionada] = useState({});
  const [localCompra, setLocalCompra] = useState(''); 

  const [itensSelecionados, setItensSelecionados] = useState([]);
  const [nomeFornecedorLote, setNomeFornecedorLote] = useState('');
  
  const [agrupamentos, setAgrupamentos] = useState(() => {
    try {
      const salvo = localStorage.getItem(`agrupamentos_virtus_${dataFiltro}`);
      return salvo ? JSON.parse(salvo) : [];
    } catch (e) { return []; }
  });
  const [precosAgrupados, setPrecosAgrupados] = useState({});
  const [grupoExpandido, setGrupoExpandido] = useState(null);
  
  const [nomesPersonalizados, setNomesPersonalizados] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nomes_personalizados_virtus')) || {}; } catch(e){ return {}; }
  });
  const [modalNomesFornecedor, setModalNomesFornecedor] = useState(null);

  const [mensagensCopiadas, setMensagensCopiadas] = useState([]);
  const [notificacoes, setNotificacoes] = useState([]);

  useEffect(() => {
    if (!window.html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('virtus_data_filtro', dataFiltro);
  }, [dataFiltro]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(`agrupamentos_virtus_${dataFiltro}`);
      setAgrupamentos(salvo ? JSON.parse(salvo) : []);
    } catch(e) { setAgrupamentos([]); }
  }, [dataFiltro]);

  useEffect(() => {
    localStorage.setItem(`agrupamentos_virtus_${dataFiltro}`, JSON.stringify(agrupamentos));
  }, [agrupamentos, dataFiltro]);

  useEffect(() => {
    localStorage.setItem('nomes_personalizados_virtus', JSON.stringify(nomesPersonalizados));
  }, [nomesPersonalizados]);

  const removerAcentos = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '').toLowerCase();

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros !== '' ? parseInt(apenasNumeros, 10) : null;
  };

  const tratarPrecoNum = (p) => parseFloat(String(p || '0').replace('R$', '').trim().replaceAll('.', '').replace(',', '.')) || 0;
  const formatarMoeda = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatarNomeItem = (str) => {
    if (!str || typeof str !== 'string' || str.trim() === '') return 'Sem Nome';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  const limparNomeParaWhatsapp = (str) => {
    return str.replace(/\s*\(.*?\)\s*/g, '').trim().toUpperCase();
  };

  const mostrarNotificacao = (mensagem, tipo = 'info') => {
    const id = Date.now() + Math.random();
    setNotificacoes(prev => [...prev, { id, mensagem, tipo }]);
    setTimeout(() => { setNotificacoes(prev => prev.filter(n => n.id !== id)); }, 3000);
  };

  const marcarComoCopiado = (id) => {
    setMensagensCopiadas(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const { data: fornData } = await supabase.from('fornecedores').select('*').order('nome_fantasia', { ascending: true });
      const { data: lojasData } = await supabase.from('lojas').select('*');
      
      const lojasDb = lojasData || [];
      const temFrazao = lojasDb.some(l => extrairNum(l.codigo_loja) === 0);
      if (!temFrazao) {
        lojasDb.unshift({ id: 99999, codigo_loja: '00', nome_fantasia: 'FRAZÃO (TESTE)' });
      }
      setLojasBd(lojasDb);
      
      const { data: prodData } = await supabase.from('produtos').select('*');
      const { data: pedData } = await supabase.from('pedidos').select('*').eq('data_pedido', dataFiltro);
      
      setPedidosRaw(pedData || []);
      
      const mapaPendentes = {};
      const mapaFeitos = {};
      const mapaGeralItens = {}; 
      const mapaForn = {};

      (pedData || []).forEach(p => {
        const idLoja = extrairNum(p.loja_id);
        const nomeProdutoUpper = String(p.nome_produto || "DESCONHECIDO").toUpperCase();
        const qtdPedida = Number(p.quantidade || 0);

        if (idLoja !== null && idLoja >= 0) { 
          const lojaInfo = lojasDb.find(l => extrairNum(l.codigo_loja) === idLoja);
          const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia : `Loja ${idLoja}`;

          if (p.status_compra === 'pendente') {
            if (!mapaPendentes[nomeProdutoUpper]) {
              mapaPendentes[nomeProdutoUpper] = { nome: nomeProdutoUpper, demanda: 0, qtd_bonificada_cliente: 0, unidade: String(p.unidade_medida || "UN"), lojas: [] };
            }
            mapaPendentes[nomeProdutoUpper].demanda += qtdPedida;
            mapaPendentes[nomeProdutoUpper].qtd_bonificada_cliente += Number(p.qtd_bonificada || 0);
            mapaPendentes[nomeProdutoUpper].lojas.push({ 
              id_pedido: p.id, loja_id: idLoja, nome_fantasia: nomeLoja, qtd_pedida: qtdPedida, qtd_bonificada_cliente: Number(p.qtd_bonificada || 0) 
            });
          } else {
            if (!mapaFeitos[nomeProdutoUpper]) mapaFeitos[nomeProdutoUpper] = { nome: nomeProdutoUpper, total_resolvido: 0, status: p.status_compra, unidade: String(p.unidade_medida || "UN"), itens: [] };
            mapaFeitos[nomeProdutoUpper].total_resolvido += qtdPedida;
            mapaFeitos[nomeProdutoUpper].itens.push(p);
          }

          if (!mapaGeralItens[nomeProdutoUpper]) {
             mapaGeralItens[nomeProdutoUpper] = {
                nome: nomeProdutoUpper, unidade: String(p.unidade_medida || "UN"), total_solicitado: 0, total_comprado: 0, isFaltaTotal: false, temBoleto: false, fornecedores_comprados: {}
             };
          }
          mapaGeralItens[nomeProdutoUpper].total_solicitado += qtdPedida;

          if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
             mapaGeralItens[nomeProdutoUpper].total_comprado += Number(p.qtd_atendida || 0);
             let fName = String(p.fornecedor_compra || 'DESCONHECIDO').replace('ALERTA|', '').trim().toUpperCase();
             if (!mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[fName]) {
                 mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[fName] = { qtd: 0, isBoleto: p.status_compra === 'boleto' };
             }
             mapaGeralItens[nomeProdutoUpper].fornecedores_comprados[fName].qtd += Number(p.qtd_atendida || 0);
          }

          if (p.status_compra === 'atendido' || p.status_compra === 'boleto') {
             let fNome = String(p.fornecedor_compra || '').replace('ALERTA|', '').trim().toUpperCase();
             if (fNome && fNome !== 'REFAZER') {
                 if (!mapaForn[fNome]) {
                     const fInfo = (fornData || []).find(f => (f.nome_fantasia || '').toUpperCase() === fNome);
                     mapaForn[fNome] = { nome: fNome, chavePix: fInfo ? fInfo.chave_pix : '', totalPix: 0, totalBoleto: 0, totalBruto: 0, totalGeral: 0, lojas: {}, alertas: [] };
                 }
                 const valNum = tratarPrecoNum(p.custo_unit);
                 const totalItemForn = (Number(p.qtd_atendida) - Number(p.qtd_bonificada || 0)) * valNum;
                 if (!mapaForn[fNome].lojas[nomeLoja]) {
                     mapaForn[fNome].lojas[nomeLoja] = { nome: nomeLoja, placa: lojaInfo?.placa_caminhao || 'SEM PLACA', totalLoja: 0, itens: [] };
                 }
                 mapaForn[fNome].lojas[nomeLoja].itens.push({ nome: nomeProdutoUpper, qtd: p.qtd_atendida, qtd_bonificada: p.qtd_bonificada, unidade: p.unidade_medida, valor_unit: p.custo_unit });
                 mapaForn[fNome].lojas[nomeLoja].totalLoja += totalItemForn;
                 mapaForn[fNome].totalGeral += totalItemForn;
             }
          }
        }
      });

      setDemandas(Object.values(mapaPendentes).sort((a,b) => a.nome.localeCompare(b.nome)));
      setPedidosFeitos(Object.values(mapaFeitos).sort((a,b) => a.nome.localeCompare(b.nome)));
      setFornecedoresBd(Object.values(mapaForn).sort((a,b) => a.nome.localeCompare(b.nome)));
      setListaGeralItens(Object.values(mapaGeralItens).sort((a,b) => a.nome.localeCompare(b.nome)));
    } catch (err) { console.error(err); } finally { setCarregando(false); }
  }, [dataFiltro]);

  // 💡 LÓGICA DE EXIBIÇÃO: Omitir unidade por padrão na cópia
  const getNomeExibicaoWhatsApp = (fornecedorNome, itemName, itemUnidade) => {
     const configItem = nomesPersonalizados[fornecedorNome]?.[itemName];
     if (configItem) {
         return configItem.usarUnidade 
            ? `${String(itemUnidade).toUpperCase()} ${configItem.nome}` 
            : configItem.nome;
     }
     // Padrão sem unidade solicitado
     return limparNomeParaWhatsapp(formatarNomeItem(itemName));
  };

  const gerarPedidoGeral = (f) => {
    if (!localCompra) return alert("⚠️ Selecione CEASA ou CEILÂNDIA!");
    const nomeLoja = lojaGeralSelecionada[f.nome];
    if (!nomeLoja) return alert("⚠️ Selecione a loja titular!");

    const placaBase = f.lojas[nomeLoja].placa || 'SEM PLACA';
    const comp = localCompra === 'ceasa' ? 'FRETE' : '2 NOVO';
    const mapaItens = {};

    Object.values(f.lojas).forEach(loja => {
      loja.itens.forEach(item => {
        if (!mapaItens[item.nome]) mapaItens[item.nome] = { ...item, qtd: 0 };
        mapaItens[item.nome].qtd += item.qtd;
      });
    });

    let msg = `*${nomeLoja.toUpperCase()}*\n\n`;
    Object.values(mapaItens).forEach(i => {
       msg += `${i.qtd} ${getNomeExibicaoWhatsApp(f.nome, i.nome, i.unidade)} - ${i.valor_unit}\n`;
    });
    msg += `\n${placaBase} - ${comp} - TOTAL: ${formatarMoeda(f.totalGeral)}`;
    navigator.clipboard.writeText(msg);
    marcarComoCopiado(`geral_${f.nome}`);
    mostrarNotificacao('✅ Pedido Geral copiado!');
  };

  const copiarMensagemWhatsapp = (lojaNome, lojaData, btnId, fNome) => {
    if (!localCompra) return alert("⚠️ Selecione CEASA ou CEILÂNDIA!");
    const comp = localCompra === 'ceasa' ? 'FRETE' : '2 NOVO';
    let msg = `*${lojaNome.toUpperCase()}*\n\n`;
    lojaData.itens.forEach(i => { 
        msg += `${i.qtd} ${getNomeExibicaoWhatsApp(fNome, i.nome, i.unidade)}\n`;
    });
    msg += `\n${lojaData.placa} - ${comp}`;
    navigator.clipboard.writeText(msg);
    marcarComoCopiado(btnId);
    mostrarNotificacao('✅ Lista da loja copiada!');
  };

  // Funções de Modal e DB (Apenas as básicas para o JSX rodar)
  const resetarPedidosDoDia = async () => { /* ... */ };
  const desfazerFeito = async (item) => { /* ... */ };
  const marcarFaltaDireto = async (item, e) => { /* ... */ };
  const abrirModalCompra = (item) => { 
    setItemModal(item); setAbaModal('completo'); 
    setLojasEnvolvidas(item.lojas.map(l => ({ ...l, qtd_receber: l.qtd_pedida, qtd_bonificada: 0, isFalta: false, isBoleto: false })));
  };
  const finalizarPedidoCompleto = () => { /* ... */ };
  const finalizarPedidoFracionado = () => { /* ... */ };
  const removerGrupoFornecedor = (id) => { setAgrupamentos(prev => prev.filter(g => g.id !== id)); };

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif', padding: '10px' }}>
      
      {/* NOTIFICAÇÕES */}
      <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999 }}>
        {notificacoes.map(n => <div key={n.id} style={{ background: '#333', color: '#fff', padding: '10px 20px', borderRadius: '8px', marginBottom: '5px' }}>{n.mensagem}</div>)}
      </div>

      {/* HEADER */}
      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0 }}>🛒 MESA DE COMPRAS</h2>
            <input type="date" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value)} style={{ marginTop: '10px' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setLocalCompra('ceasa')} style={{ background: localCompra === 'ceasa' ? '#f97316' : '#444', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px' }}>CEASA</button>
            <button onClick={() => setLocalCompra('ceilandia')} style={{ background: localCompra === 'ceilandia' ? '#f97316' : '#444', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px' }}>CEILÂNDIA</button>
          </div>
        </div>
      </div>

      {/* ABAS */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px', overflowX: 'auto' }}>
        <button onClick={() => setAbaAtiva('pendentes')} style={{ padding: '15px', borderRadius: '12px', border: 'none', background: abaAtiva === 'pendentes' ? '#f97316' : '#fff' }}>PENDENTES</button>
        <button onClick={() => setAbaAtiva('fornecedores')} style={{ padding: '15px', borderRadius: '12px', border: 'none', background: abaAtiva === 'fornecedores' ? '#111' : '#fff', color: abaAtiva === 'fornecedores' ? '#fff' : '#000' }}>FORNECEDORES</button>
      </div>

      {/* CONTEÚDO PENDENTES */}
      {abaAtiva === 'pendentes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
          {demandas.map(item => (
            <div key={item.nome} onClick={() => abrirModalCompra(item)} style={{ background: '#fff', padding: '15px', borderRadius: '16px', textAlign: 'center', cursor: 'pointer' }}>
               <div style={{ background: '#fef3c7', width: '40px', height: '40px', borderRadius: '50%', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{item.demanda}</div>
               <strong style={{ fontSize: '12px' }}>{item.nome}</strong>
            </div>
          ))}
        </div>
      )}

      {/* CONTEÚDO FORNECEDORES */}
      {abaAtiva === 'fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {fornecedoresBd.map(f => (
            <div key={f.nome} style={{ background: '#fff', padding: '20px', borderRadius: '20px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
              <div onClick={() => setFornExpandido(fornExpandido === f.nome ? null : f.nome)} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                <strong style={{fontSize: '16px'}}>🏢 {f.nome}</strong>
                <strong>{formatarMoeda(f.totalGeral)}</strong>
              </div>
              
              {fornExpandido === f.nome && (
                <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                  <button onClick={() => setModalNomesFornecedor(f)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }}>⚙️ Personalizar Nomes WhatsApp</button>
                  <select onChange={e => setLojaGeralSelecionada({...lojaGeralSelecionada, [f.nome]: e.target.value})} value={lojaGeralSelecionada[f.nome] || ''} style={{width: '100%', padding: '10px', marginBottom: '10px'}}>
                    <option value="">Escolha a loja titular...</option>
                    {Object.keys(f.lojas).map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <button onClick={() => gerarPedidoGeral(f)} style={{ width: '100%', padding: '15px', background: '#111', color: '#fff', borderRadius: '10px', fontWeight: 'bold' }}>📋 COPIAR GERAL</button>
                  
                  <div style={{ marginTop: '15px' }}>
                    {Object.entries(f.lojas).map(([nomeL, dadosL]) => (
                      <div key={nomeL} style={{ background: '#f9f9f9', padding: '10px', borderRadius: '10px', marginBottom: '10px' }}>
                        <strong>{nomeL}</strong>
                        {dadosL.itens.map((it, idx) => <div key={idx} style={{fontSize: '12px'}}>{it.qtd} {getNomeExibicaoWhatsApp(f.nome, it.nome, it.unidade)}</div>)}
                        <button onClick={() => copiarMensagemWhatsapp(nomeL, dadosL, `btn_${f.nome}_${nomeL}`, f.nome)} style={{ width: '100%', marginTop: '5px', background: '#25d366', color: '#fff', border: 'none', padding: '8px', borderRadius: '5px' }}>🟢 COPIAR LOJA</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL NOMES PERSONALIZADOS */}
      {modalNomesFornecedor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#fff', padding: '20px', borderRadius: '20px', width: '90%', maxWidth: '400px' }}>
             <h3>Configurar Nomes</h3>
             {Array.from(new Set(Object.values(modalNomesFornecedor.lojas).flatMap(l => l.itens.map(i => i.nome)))).map(nomeOrig => {
                const config = nomesPersonalizados[modalNomesFornecedor.nome]?.[nomeOrig] || { nome: formatarNomeItem(nomeOrig), usarUnidade: false };
                return (
                  <div key={nomeOrig} style={{ marginBottom: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '10px' }}>
                    <small>{nomeOrig}</small>
                    <input type="text" value={config.nome} onChange={e => setNomesPersonalizados({...nomesPersonalizados, [modalNomesFornecedor.nome]: {...nomesPersonalizados[modalNomesFornecedor.nome], [nomeOrig]: {...config, nome: e.target.value.toUpperCase()}}})} style={{width: '100%', padding: '8px', margin: '5px 0'}} />
                    <label style={{fontSize: '11px'}}><input type="checkbox" checked={config.usarUnidade} onChange={e => setNomesPersonalizados({...nomesPersonalizados, [modalNomesFornecedor.nome]: {...nomesPersonalizados[modalNomesFornecedor.nome], [nomeOrig]: {...config, usarUnidade: e.target.checked}}})} /> Incluir Unidade (CX/KG)?</label>
                  </div>
                );
             })}
             <button onClick={() => setModalNomesFornecedor(null)} style={{ width: '100%', padding: '15px', background: '#111', color: '#fff', borderRadius: '10px' }}>SALVAR</button>
          </div>
        </div>
      )}

      {/* MODAL COMPRA (PENDENTES) */}
      {itemModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'flex-end' }}>
          <div style={{ background: '#fff', width: '100%', padding: '30px', borderRadius: '30px 30px 0 0' }}>
            <button onClick={() => setItemModal(null)} style={{float:'right'}}>✕</button>
            <h3>{itemModal.nome}</h3>
            <input placeholder="Fornecedor" value={dadosCompra.fornecedor} onChange={e => setDadosCompra({...dadosCompra, fornecedor: e.target.value.toUpperCase()})} style={{width: '100%', padding: '15px', marginBottom: '10px'}} />
            <input placeholder="Preço" value={dadosCompra.valor_unit} onChange={e => setDadosCompra({...dadosCompra, valor_unit: e.target.value})} style={{width: '100%', padding: '15px', marginBottom: '10px'}} />
            <button onClick={finalizarPedidoCompleto} style={{width: '100%', padding: '20px', background: '#111', color: '#fff', borderRadius: '15px', fontWeight: 'bold'}}>FINALIZAR</button>
          </div>
        </div>
      )}

    </div>
  );
}