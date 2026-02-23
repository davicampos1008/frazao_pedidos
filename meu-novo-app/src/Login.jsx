import React, { useState, useRef } from 'react';

export default function Login({ aoLogar }) {
  const tema = {
    corPrincipal: '#f97316',    // Cor do Frazão Frutas e Botão
    corDestaque: '#f97316',     // Cor do "&"
    corSubtitulo: '#999999',    // Cor do "CIA"
    corSlogan: '#666666',       // Cor do Slogan embaixo
    corFundoTela: '#111111',
    corCard: '#095317',
    
    tamanhoFrazao: '28px',      
    tamanhoAmpersand: '45px',   
    tamanhoCia: '18px',         
    espacamentoCia: '10px',     
    
    tamanhoSlogan: '11px',      
    espacamentoSlogan: '1px',   
    margemSlogan: '15px',       

    raioCard: '35px',
    fontePrincipal: 'sans-serif',
    pesoFonte: '900'            
  };

  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const campoSenhaRef = useRef(null);

  // 💡 V.I.R.T.U.S: Função limpa. O trabalho pesado do banco quem faz é o App.jsx
  const tratarLogin = () => {
    if (!codigo || !senha) {
      alert("⚠️ Preencha todos os campos.");
      return;
    }
    aoLogar(codigo, senha); // Passa a bola pro App.jsx
  };

  const estiloContainer = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', width: '100vw', backgroundColor: tema.corFundoTela,
    fontFamily: tema.fontePrincipal, position: 'fixed', top: 0, left: 0
  };

  const estiloCard = {
    backgroundColor: tema.corCard, width: '90%', maxWidth: '350px',
    padding: '40px', borderRadius: tema.raioCard, textAlign: 'center',
    boxShadow: '0 15px 50px rgba(0,0,0,0.5)', boxSizing: 'border-box'
  };

  const estiloInput = {
    width: '100%', padding: '15px', borderRadius: '12px',
    border: '2px solid #eee', fontSize: '18px', boxSizing: 'border-box',
    outline: 'none', marginBottom: '20px', textAlign: 'center'
  };

  return (
    <div style={estiloContainer}>
      <div style={estiloCard}>
        
        {/* --- LOGO --- */}
        <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: tema.tamanhoFrazao, fontWeight: tema.pesoFonte, color: tema.corPrincipal, letterSpacing: '-1px' }}>
            FRAZÃO FRUTAS
          </div>
          <div style={{ fontSize: tema.tamanhoAmpersand, fontWeight: tema.pesoFonte, color: tema.corDestaque, margin: '5px 0', lineHeight: '1' }}>
            &
          </div>
          <div style={{ fontSize: tema.tamanhoCia, fontWeight: tema.pesoFonte, color: tema.corSubtitulo, letterSpacing: tema.espacamentoCia, textIndent: tema.espacamentoCia }}>
            CIA
          </div>
          <div style={{ 
            marginTop: tema.margemSlogan, padding: '8px 12px', borderTop: `1px solid #eee`, 
            fontSize: tema.tamanhoSlogan, color: tema.corSlogan, fontWeight: '600', 
            fontStyle: 'italic', letterSpacing: tema.espacamentoSlogan, textTransform: 'uppercase' 
          }}>
            Do produtor direto pra sua loja
          </div>
        </div>

        {/* --- CAMPOS --- */}
        <div style={{ textAlign: 'left', marginTop: '10px' }}>
          <label style={{ fontSize: '10px', fontWeight: '900', color: '#bbb', marginLeft: '5px' }}>CÓDIGO</label>
          <input 
            type="text" 
            maxLength="4"
            placeholder="0000"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && campoSenhaRef.current.focus()}
            style={estiloInput}
          />

          <label style={{ fontSize: '10px', fontWeight: '900', color: '#bbb', marginLeft: '5px' }}>SENHA</label>
          <input 
            type="password" 
            ref={campoSenhaRef}
            placeholder="••••"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && tratarLogin()}
            style={estiloInput}
          />
        </div>

        <button 
          onClick={tratarLogin} 
          style={{
            width: '100%', backgroundColor: tema.corPrincipal, color: 'white',
            padding: '18px', borderRadius: '15px', fontWeight: '900',
            cursor: 'pointer', border: 'none', fontSize: '16px', marginTop: '10px'
          }}
        >
          ENTRAR NO SISTEMA
        </button>

      </div>
    </div>
  );
}