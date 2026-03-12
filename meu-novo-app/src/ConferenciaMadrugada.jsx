import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

export default function ConferenciaMadrugada() {
  const configDesign = {
    geral: { fontePadrao: "'Inter', sans-serif", raioBordaGlobal: '20px', sombraSuave: '0 8px 30px rgba(0,0,0,0.04)' },
    cores: { primaria: '#f97316', sucesso: '#22c55e', alerta: '#ef4444', aviso: '#eab308' }
  };

  // 💡 NOVA LÓGICA DE DATA FIXA E SELECIONÁVEL
  const obterDataLocal = () => {
    const data = new Date();
    const tzOffset = data.getTimezoneOffset() * 60000;
    return new Date(data.getTime() - tzOffset).toISOString().split('T')[0];
  };

  const [dataFiltro, setDataFiltro] = useState(() => {
    return localStorage.getItem('virtus_conferencia_data') || obterDataLocal();
  });
  const dataBr = dataFiltro.split('-').reverse().join('/');

  useEffect(() => {
    localStorage.setItem('virtus_conferencia_data', dataFiltro);
  }, [dataFiltro]);
  // 💡 FIM DA LÓGICA DE DATA

  const [abaAtiva, setAbaAtiva] = useState('operacional');
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  
  const [dadosAgrupados, setDadosAgrupados] = useState([]);
  const [metricasGestao, setMetricasGestao] = useState({ total: 0, recebido: 0, falta: 0, parcial: 0, aguardando: 0 });
  const [fornecedoresExpandidos, setFornecedoresExpandidos] = useState({});
  
  // 💡 Controle dos inputs de quantidade parcial
  const [qtdEditando, setQtdEditando] = useState({});

  const extrairNum = (valor) => {
    if (valor === null || valor === undefined) return null;
    const apenasNumeros = String(valor).replace(/\D/g, ''); 
    return apenasNumeros !== '' ? parseInt(apenasNumeros, 10) : null;
  };

  const formatarNomeItem = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });
  };

  // 💡 Normalizador para evitar bugs de busca com acentos e espaços
  const normalizar = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  };

  const carregarDados = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const { data: lojasData } = await supabase.from('lojas').select('*');
      const { data: pedData } = await supabase.from('pedidos')
        .select('*')
        .eq('data_pedido', dataFiltro) // 💡 Modificado de 'hoje' para 'dataFiltro'
        .in('status_compra', ['atendido', 'boleto']);
      
      const pedidos = pedData || [];
      const lojasDb = lojasData || [];

      const mapaForn = {};

      pedidos.forEach(p => {
        const fNome = String(p.fornecedor_compra || 'DESCONHECIDO').toUpperCase();
        const pNome = String(p.nome_produto || 'SEM NOME').toUpperCase();
        const idLoja = extrairNum(p.loja_id);
        const lojaInfo = lojasDb.find(l => extrairNum(l.codigo_loja) === idLoja);
        const nomeLoja = lojaInfo ? lojaInfo.nome_fantasia.replace(/^\d+\s*-\s*/, '').trim().toUpperCase() : `LOJA ${idLoja}`;
        
        const statusRec = p.status_recebimento || 'aguardando'; 
        const qtdPedida = Number(p.qtd_atendida || 0);
        
        // Se a coluna nova for null, assume que a qtd_recebida é a própria qtd pedida para não bugar a tela
        const qtdRecebidaGalpao = p.qtd_recebida_galpao !== null && p.qtd_recebida_galpao !== undefined ? Number(p.qtd_recebida_galpao) : qtdPedida;

        if (!mapaForn[fNome]) {
            mapaForn[fNome] = { fornecedor: fNome, totalItens: 0, recebidos: 0, aguardando: 0, faltas: 0, parciais: 0, itens: {} };
        }

        mapaForn[fNome].totalItens++;

        if (!mapaForn[fNome].itens[pNome]) {
            mapaForn[fNome].itens[pNome] = { 
                nome: pNome, 
                unidade: p.unidade_medida || 'UN', 
                qtd_total: 0, 
                lojas: []
            };
        }

        mapaForn[fNome].itens[pNome].qtd_total += qtdPedida;
        mapaForn[fNome].itens[pNome].lojas.push({
            id_pedido: p.id,
            nome_loja: nomeLoja,
            qtd: qtdPedida,
            qtd_recebida_galpao: qtdRecebidaGalpao,
            status: statusRec
        });
      });

      const arrayFinal = Object.values(mapaForn).map(f => {
          f.itens = Object.values(f.itens).sort((a, b) => a.nome.localeCompare(b.nome));
          return f;
      }).sort((a, b) => a.fornecedor.localeCompare(b.fornecedor));

      setDadosAgrupados(arrayFinal);

    } catch (err) { console.error(err); }
    finally { if (!silencioso) setCarregando(false); }
  }, [dataFiltro]); // 💡 Modificado de 'hoje' para 'dataFiltro'

  // 💡 Efeito Inteligente que atualiza as métricas instantaneamente sempre que os dados mudam
  useEffect(() => {
     let metTotal = 0; let metRecebido = 0; let metFalta = 0; let metAguardando = 0; let metParcial = 0;
     dadosAgrupados.forEach(f => {
        f.itens.forEach(i => {
           i.lojas.forEach(l => {
              metTotal++;
              if (l.status === 'recebido') metRecebido++;
              else if (l.status === 'falta') metFalta++;
              else if (l.status === 'parcial') metParcial++;
              else metAguardando++;
           });
        });
     });
     setMetricasGestao({ total: metTotal, recebido: metRecebido, falta: metFalta, parcial: metParcial, aguardando: metAguardando });
  }, [dadosAgrupados]);

  useEffect(() => { 
      carregarDados(); 
      const radar = setInterval(() => carregarDados(true), 15000); 
      return () => clearInterval(radar);
  }, [carregarDados]);

  const alternarFornecedor = (fornNome) => {
      setFornecedoresExpandidos(prev => ({ ...prev, [fornNome]: !prev[fornNome] }));
  };

  // 💡 MOTOR DE RECEBIMENTO OTIMIZADO (Sem Recarregar a Tela)
  const registrarRecebimento = async (id_pedido, qtdChegou, qtdEsperada, fornecedorNome, isDesfazer = false) => {
      let novoStatus = 'recebido';
      let qtdReal = Number(qtdChegou) || 0;

      if (isDesfazer) {
          novoStatus = 'aguardando';
          qtdReal = qtdEsperada; // Ao desfazer, volta ao padrão esperado
      } 
      else if (qtdReal === 0) novoStatus = 'falta';
      else if (qtdReal < qtdEsperada) novoStatus = 'parcial';

      // 1. Atualiza UI na hora para não dar delay ou tela branca
      setDadosAgrupados(prev => prev.map(f => {
          if (f.fornecedor === fornecedorNome) {
              const novosItens = f.itens.map(i => {
                  return {
                      ...i,
                      lojas: i.lojas.map(l => 
                          l.id_pedido === id_pedido ? { ...l, status: novoStatus, qtd_recebida_galpao: qtdReal } : l
                      )
                  };
              });
              return { ...f, itens: novosItens };
          }
          return f;
      }));

      // 2. Salva no Banco em segundo plano e silenciosamente
      try {
          await supabase.from('pedidos').update({ 
              status_recebimento: novoStatus, 
              qtd_recebida_galpao: qtdReal 
          }).eq('id', id_pedido);
      } catch (err) {
          console.error("Erro ao salvar:", err);
      }
  };

  // 💡 RECEBE TUDO OU FALTA TUDO DE UMA VEZ
  const registrarEmMassa = async (lojasArray, novoStatus, fornecedorNome) => {
      const ids = lojasArray.map(l => l.id_pedido);
      
      setDadosAgrupados(prev => prev.map(f => {
          if (f.fornecedor === fornecedorNome) {
              const novosItens = f.itens.map(i => {
                  return {
                      ...i,
                      lojas: i.lojas.map(l => ids.includes(l.id_pedido) ? { ...l, status: novoStatus, qtd_recebida_galpao: (novoStatus === 'recebido' ? l.qtd : 0) } : l)
                  };
              });
              return { ...f, itens: novosItens };
          }
          return f;
      }));

      const promessas = lojasArray.map(l => {
          return supabase.from('pedidos').update({ 
              status_recebimento: novoStatus, 
              qtd_recebida_galpao: novoStatus === 'recebido' ? l.qtd : 0 
          }).eq('id', l.id_pedido);
      });
      await Promise.all(promessas);
  };

  if (carregando && dadosAgrupados.length === 0) return <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>🔄 Carregando Conferência...</div>;

  const termoBusca = normalizar(busca);

  return (
    <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto', fontFamily: configDesign.geral.fontePadrao, paddingBottom: '120px', padding: '10px' }}>
      
      <div style={{ backgroundColor: '#111', padding: '25px', borderRadius: '24px', color: 'white', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '900' }}>🔦 CONFERÊNCIA DE MADRUGADA</h2>
            
            {/* 💡 NOVO: Seletor de Data Fixo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Data Base:</span>
              <input 
                type="date" 
                value={dataFiltro} 
                onChange={(e) => setDataFiltro(e.target.value)}
                style={{ background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', outline: 'none', cursor: 'pointer' }}
              />
              {dataFiltro !== obterDataLocal() && (
                <button 
                  onClick={() => setDataFiltro(obterDataLocal())} 
                  style={{ background: configDesign.cores.primaria, color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  🗓️ VOLTAR PARA HOJE
                </button>
              )}
            </div>

          </div>
          <button onClick={() => carregarDados()} style={{background: '#333', border: 'none', color: '#fff', padding: '12px 15px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold'}}>🔄 ATUALIZAR</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
        <button onClick={() => setAbaAtiva('operacional')} style={{ flex: 1, padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', backgroundColor: abaAtiva === 'operacional' ? configDesign.cores.primaria : '#fff', color: abaAtiva === 'operacional' ? '#fff' : configDesign.geral.corTextoSecundario }}>
          📦 OPERACIONAL (CEASA)
        </button>
        <button onClick={() => setAbaAtiva('painel')} style={{ flex: 1, padding: '15px 10px', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', backgroundColor: abaAtiva === 'painel' ? '#111' : '#fff', color: abaAtiva === 'painel' ? '#fff' : configDesign.geral.corTextoSecundario }}>
          📊 PAINEL GESTÃO (CASA)
        </button>
      </div>

      {abaAtiva === 'operacional' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '10px 15px', display: 'flex', gap: '10px', border: `1px solid #e2e8f0` }}>
            <span>🔍</span><input placeholder="Filtrar fornecedor ou item..." value={busca} onChange={e => setBusca(e.target.value)} style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', fontSize: '14px' }} />
          </div>

          {/* 💡 CORREÇÃO DO FILTRO: Mostra o fornecedor se o nome dele ou de algum item bater com a busca */}
          {dadosAgrupados.filter(f => normalizar(f.fornecedor).includes(termoBusca) || f.itens.some(i => normalizar(i.nome).includes(termoBusca))).map(f => {
             const isExpandido = fornecedoresExpandidos[f.fornecedor];
             
             const qtdLojasPendentes = f.itens.reduce((acc, item) => acc + item.lojas.filter(l => l.status === 'aguardando').length, 0);
             const isFinalizado = qtdLojasPendentes === 0;

             // 💡 CORREÇÃO DO MISTÉRIO DOS ITENS VAZIOS:
             // Se a busca bateu com o nome do fornecedor (ex: "Carambola"), ele mostra todos os itens dentro.
             // Se a busca bateu só com a fruta (ex: "Melão"), ele filtra só o Melão.
             const isFornecedorMatch = normalizar(f.fornecedor).includes(termoBusca);
             const itensParaMostrar = isFornecedorMatch ? f.itens : f.itens.filter(i => normalizar(i.nome).includes(termoBusca));

             return (
                <div key={f.fornecedor} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: configDesign.geral.sombraSuave, borderTop: isFinalizado ? `5px solid ${configDesign.cores.sucesso}` : `5px solid ${configDesign.cores.primaria}` }}>
                   
                   <div onClick={() => alternarFornecedor(f.fornecedor)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                      <h3 style={{ margin: 0, color: '#111', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        🚚 {f.fornecedor} 
                        {isFinalizado ? (
                           <span style={{background: '#dcfce7', color: '#166534', fontSize: '11px', padding: '3px 8px', borderRadius: '8px'}}>✅ Finalizado</span>
                        ) : (
                           <span style={{background: '#fefce8', color: '#b45309', fontSize: '11px', padding: '3px 8px', borderRadius: '8px'}}>{qtdLojasPendentes} entregas pendentes</span>
                        )}
                      </h3>
                      <span style={{ color: '#ccc', transform: isExpandido ? 'rotate(90deg)' : 'none', transition: '0.2s', fontSize: '18px' }}>❯</span>
                   </div>

                   {isExpandido && (
                     <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {itensParaMostrar.map(item => {
                           const lojasAguardando = item.lojas.filter(l => l.status === 'aguardando');
                           const todasConcluidas = lojasAguardando.length === 0;

                           return (
                             <div key={item.nome} style={{ background: todasConcluidas ? '#f0fdf4' : '#f8fafc', border: `1px solid ${todasConcluidas ? '#86efac' : '#cbd5e1'}`, borderRadius: '12px', padding: '15px', transition: '0.3s' }}>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                   <strong style={{ fontSize: '16px', color: '#111' }}>{formatarNomeItem(item.nome)}</strong>
                                   <span style={{ background: '#111', color: '#fff', padding: '5px 10px', borderRadius: '8px', fontWeight: '900', fontSize: '15px' }}>
                                      {item.qtd_total} <small style={{fontSize:'10px', color: '#aaa'}}>{item.unidade}</small>
                                   </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {item.lojas.map((loja) => {
                                        // Garante que o input mostre o número correto de forma fluida
                                        const valInputAtual = qtdEditando[loja.id_pedido] !== undefined ? qtdEditando[loja.id_pedido] : loja.qtd;

                                        let bgLoja = '#fff';
                                        let borderLoja = '1px solid #e2e8f0';
                                        if (loja.status === 'recebido') { bgLoja = '#dcfce7'; borderLoja = '1px solid #4ade80'; }
                                        if (loja.status === 'falta') { bgLoja = '#fef2f2'; borderLoja = '1px solid #f87171'; }
                                        if (loja.status === 'parcial') { bgLoja = '#fffbeb'; borderLoja = '1px solid #fbbf24'; }

                                        return (
                                            <div key={loja.id_pedido} style={{ background: bgLoja, border: borderLoja, padding: '12px 15px', borderRadius: '10px', transition: '0.3s' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <span style={{ fontWeight: '900', fontSize: '14px', color: '#334155' }}>{loja.nome_loja}</span>
                                                        <span style={{ marginLeft: '10px', fontSize: '11px', color: '#64748b' }}>Pediu: <b style={{color: '#111'}}>{loja.qtd}</b></span>
                                                    </div>
                                                </div>

                                                {loja.status === 'aguardando' ? (
                                                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '8px', padding: '4px' }}>
                                                            <span style={{fontSize: '10px', fontWeight: 'bold', color: '#64748b', marginRight: '5px'}}>Chegou:</span>
                                                            <button onClick={() => setQtdEditando({...qtdEditando, [loja.id_pedido]: Math.max(0, Number(valInputAtual) - 1)})} style={{width: '30px', height: '30px', border: 'none', background: '#e2e8f0', borderRadius: '6px', fontWeight: 'bold'}}>-</button>
                                                            <input 
                                                              type="number" 
                                                              value={valInputAtual === '' ? '' : valInputAtual} 
                                                              onChange={e => setQtdEditando({...qtdEditando, [loja.id_pedido]: e.target.value === '' ? '' : parseInt(e.target.value) || 0})} 
                                                              style={{width: '45px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: '900', fontSize: '14px', outline: 'none'}} 
                                                            />
                                                            <button onClick={() => setQtdEditando({...qtdEditando, [loja.id_pedido]: Number(valInputAtual) + 1})} style={{width: '30px', height: '30px', border: 'none', background: '#e2e8f0', borderRadius: '6px', fontWeight: 'bold'}}>+</button>
                                                        </div>
                                                        
                                                        <div style={{ display: 'flex', gap: '5px', flex: 1 }}>
                                                            <button onClick={() => registrarRecebimento(loja.id_pedido, valInputAtual, loja.qtd, f.fornecedor, false)} style={{ flex: 1, background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', height: '38px', cursor: 'pointer', fontSize: '12px' }}>✅ SALVAR</button>
                                                            <button onClick={() => registrarRecebimento(loja.id_pedido, 0, loja.qtd, f.fornecedor, false)} style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', fontWeight: 'bold', height: '38px', padding: '0 15px', cursor: 'pointer', fontSize: '12px' }}>❌ FALTA</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '12px', fontWeight: '900', color: loja.status === 'recebido' ? '#166534' : (loja.status === 'parcial' ? '#b45309' : '#991b1b') }}>
                                                            {loja.status === 'recebido' ? '✅ CHEGOU COMPLETO' : loja.status === 'parcial' ? `⚠️ CHEGOU SÓ ${loja.qtd_recebida_galpao} (Faltou ${loja.qtd - loja.qtd_recebida_galpao})` : '❌ NÃO CHEGOU NADA'}
                                                        </span>
                                                        <button onClick={() => registrarRecebimento(loja.id_pedido, loja.qtd, loja.qtd, f.fornecedor, true)} style={{ background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>↩️ DESFAZER</button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {!todasConcluidas && item.lojas.length > 1 && (
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #cbd5e1' }}>
                                        <button onClick={() => registrarEmMassa(lojasAguardando, 'recebido', f.fornecedor)} style={{ flex: 1, background: configDesign.cores.sucesso, color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>✅ TUDO CHEGOU</button>
                                        <button onClick={() => registrarEmMassa(lojasAguardando, 'falta', f.fornecedor)} style={{ background: '#fef2f2', color: configDesign.cores.alerta, border: `1px solid ${configDesign.cores.alerta}`, padding: '12px', borderRadius: '8px', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>❌ FALTOU GERAL</button>
                                    </div>
                                )}
                             </div>
                           );
                        })}
                     </div>
                   )}
                </div>
             );
          })}
          
          {dadosAgrupados.every(f => f.itens.every(i => i.lojas.every(l => l.status !== 'aguardando'))) && dadosAgrupados.length > 0 && (
             <div style={{ textAlign: 'center', padding: '40px', color: configDesign.cores.sucesso, backgroundColor: '#fff', borderRadius: '20px', fontWeight: '900', fontSize: '18px' }}>
                 🎉 TUDO CONFERIDO! GALPÃO LIMPO!
             </div>
          )}
        </div>
      )}

      {abaAtiva === 'painel' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
           
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave, textAlign: 'center', borderBottom: '4px solid #111' }}>
                 <span style={{ display: 'block', fontSize: '11px', color: configDesign.geral.corTextoSecundario, fontWeight: 'bold' }}>ENTREGAS TOTAIS</span>
                 <strong style={{ fontSize: '28px', color: '#111' }}>{metricasGestao.total}</strong>
              </div>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave, textAlign: 'center', borderBottom: `4px solid ${configDesign.cores.sucesso}` }}>
                 <span style={{ display: 'block', fontSize: '11px', color: configDesign.geral.corTextoSecundario, fontWeight: 'bold' }}>RECEBIDAS</span>
                 <strong style={{ fontSize: '28px', color: configDesign.cores.sucesso }}>{metricasGestao.recebido}</strong>
              </div>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave, textAlign: 'center', borderBottom: `4px solid ${configDesign.cores.aviso}` }}>
                 <span style={{ display: 'block', fontSize: '11px', color: configDesign.geral.corTextoSecundario, fontWeight: 'bold' }}>PARCIAIS</span>
                 <strong style={{ fontSize: '28px', color: configDesign.cores.aviso }}>{metricasGestao.parcial}</strong>
              </div>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave, textAlign: 'center', borderBottom: `4px solid ${configDesign.cores.alerta}` }}>
                 <span style={{ display: 'block', fontSize: '11px', color: configDesign.geral.corTextoSecundario, fontWeight: 'bold' }}>FALTAS</span>
                 <strong style={{ fontSize: '28px', color: configDesign.cores.alerta }}>{metricasGestao.falta}</strong>
              </div>
           </div>

           {metricasGestao.falta > 0 && (
             <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '16px', border: `1px solid ${configDesign.cores.alerta}` }}>
                <h3 style={{ margin: '0 0 15px 0', color: configDesign.cores.alerta, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  🚨 FALTAS TOTAIS INFORMADAS
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   {dadosAgrupados.map(f => f.itens.map(item => {
                       const lojasFalta = item.lojas.filter(l => l.status === 'falta');
                       if (lojasFalta.length === 0) return null;
                       return lojasFalta.map(loja => (
                          <div key={loja.id_pedido} style={{ background: '#fff', padding: '10px 15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: 'bold', color: '#991b1b' }}>
                             <span>{formatarNomeItem(item.nome)} ({loja.qtd} {item.unidade})</span>
                             <div style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: '11px', color: '#111' }}>{loja.nome_loja}</span>
                                <span style={{ fontSize: '9px', color: '#ef4444' }}>Forn: {f.fornecedor}</span>
                             </div>
                          </div>
                       ));
                   }))}
                </div>
             </div>
           )}

           {metricasGestao.parcial > 0 && (
             <div style={{ background: '#fffbeb', padding: '20px', borderRadius: '16px', border: `1px solid ${configDesign.cores.aviso}` }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#b45309', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  ⚠️ ENTREGAS INCOMPLETAS (PARCIAIS)
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                   {dadosAgrupados.map(f => f.itens.map(item => {
                       const lojasParcial = item.lojas.filter(l => l.status === 'parcial');
                       if (lojasParcial.length === 0) return null;
                       return lojasParcial.map(loja => (
                          <div key={loja.id_pedido} style={{ background: '#fff', padding: '10px 15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: 'bold', color: '#b45309' }}>
                             <div>
                                <span>{formatarNomeItem(item.nome)}</span>
                                <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>Pediu {loja.qtd} | <b style={{color: '#b45309'}}>Chegou {loja.qtd_recebida_galpao}</b></span>
                             </div>
                             <div style={{ textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: '11px', color: '#111' }}>{loja.nome_loja}</span>
                                <span style={{ fontSize: '9px', color: '#b45309' }}>Forn: {f.fornecedor}</span>
                             </div>
                          </div>
                       ));
                   }))}
                </div>
             </div>
           )}

           <div style={{ background: '#fff', padding: '20px', borderRadius: '16px', boxShadow: configDesign.geral.sombraSuave }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#111', fontSize: '16px' }}>Progresso por Fornecedor</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                 {dadosAgrupados.map(f => {
                    let totalAcoesFeitas = 0;
                    let totalAcoesAguardando = 0;
                    let teveFalta = false;
                    let teveParcial = false;

                    f.itens.forEach(i => {
                        i.lojas.forEach(l => {
                            if (l.status === 'aguardando') totalAcoesAguardando++;
                            else {
                                totalAcoesFeitas++;
                                if (l.status === 'falta') teveFalta = true;
                                if (l.status === 'parcial') teveParcial = true;
                            }
                        });
                    });

                    const totalGeral = totalAcoesFeitas + totalAcoesAguardando;
                    const pctRecebido = Math.round((totalAcoesFeitas / totalGeral) * 100) || 0;
                    
                    let corBarra = '#3b82f6';
                    if (pctRecebido === 100 && !teveFalta && !teveParcial) corBarra = configDesign.cores.sucesso;
                    if (teveFalta) corBarra = configDesign.cores.alerta;
                    else if (teveParcial) corBarra = configDesign.cores.aviso;

                    return (
                       <div key={f.fornecedor}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px' }}>
                             <span style={{color: '#111'}}>{f.fornecedor}</span>
                             <span style={{color: corBarra}}>{pctRecebido}% ({totalAcoesFeitas}/{totalGeral})</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                             <div style={{ width: `${pctRecebido}%`, height: '100%', background: corBarra, transition: 'width 0.5s' }}></div>
                          </div>
                       </div>
                    );
                 })}
              </div>
           </div>

        </div>
      )}

    </div>
  );
}