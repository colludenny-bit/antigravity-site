import React from 'react';
import { Button } from '../ui/button';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Qualcosa è andato storto</h1>
                    <p className="text-muted-foreground text-center max-w-md mb-8">
                        Si è verificato un errore imprevisto. Abbiamo registrato il problema e stiamo lavorando per risolverlo.
                    </p>
                    <div className="space-y-4 w-full max-w-xs">
                        <Button
                            onClick={this.handleReload}
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            Ricarica Pagina
                        </Button>
                        <Button
                            onClick={() => window.location.href = '/'}
                            variant="outline"
                            className="w-full border-border/50"
                        >
                            Torna alla Home
                        </Button>
                    </div>
                    <div className="mt-8 p-4 bg-secondary/50 rounded-lg text-xs font-mono text-muted-foreground overflow-auto max-w-lg w-full">
                        {this.state.error && this.state.error.toString()}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
