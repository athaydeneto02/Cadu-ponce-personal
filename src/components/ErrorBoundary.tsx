/**
 * ErrorBoundary.tsx
 * Captura qualquer erro inesperado no React e evita a "tela branca".
 * Oferece botão para recuperar o app e limpar dados corrompidos.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error in React tree:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      // Clean oversized or corrupt exercise cache if any
      const raw = localStorage.getItem('cadu_ponce_exercises_v3');
      if (raw && (raw.includes('data:video') || raw.length > 500000)) {
        localStorage.removeItem('cadu_ponce_exercises_v3');
      }
    } catch {
      // ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0c1622] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>

          <h2 className="text-xl font-black uppercase tracking-wide mb-2">
            Algo deu errado ao carregar
          </h2>

          <p className="text-slate-400 text-xs max-w-sm mb-6 leading-relaxed">
            {this.state.error?.message?.includes('quota') || this.state.error?.message?.includes('Storage')
              ? 'O tamanho de um arquivo anexado excedeu o limite do navegador. Clique abaixo para restaurar com segurança.'
              : 'Ocorreu um erro temporário no carregamento. Clique abaixo para recuperar o aplicativo.'}
          </p>

          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 bg-[#dc2626] hover:bg-red-500 text-white font-black text-xs uppercase px-6 py-3.5 rounded-xl tracking-wider transition cursor-pointer shadow-lg shadow-red-900/40"
          >
            <RefreshCw className="w-4 h-4" />
            Restaurar Aplicativo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
