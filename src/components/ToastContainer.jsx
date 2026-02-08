
import React from 'react';
import { useToast } from '../context/ToastContext';
import { X, CheckCircle, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import './Toast.css';

const ToastContainer = () => {
    const { toasts, removeToast } = useToast();

    const getIcon = (type) => {
        switch (type) {
            case 'success': return <CheckCircle size={20} />;
            case 'error': return <AlertCircle size={20} />;
            case 'warning': return <AlertTriangle size={20} />;
            default: return <Info size={20} />;
        }
    };

    return (
        <div className="toast-container">
            {toasts.map((toast) => (
                <div key={toast.id} className={`toast ${toast.type}`}>
                    <div className="toast-icon">
                        {getIcon(toast.type)}
                    </div>
                    <div className="toast-message">{toast.message}</div>
                    <button className="toast-close" onClick={() => removeToast(toast.id)}>
                        <X size={16} />
                    </button>
                </div>
            ))}
        </div>
    );
};

export default ToastContainer;
