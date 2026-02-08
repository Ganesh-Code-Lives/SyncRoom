import React from 'react';
import classNames from 'classnames';
import './Input.css';

const Input = ({
    label,
    error,
    fullWidth = false,
    className,
    containerClassName,
    ...props
}) => {
    return (
        <div className={classNames('input-container', { 'input-full': fullWidth }, containerClassName)}>
            {label && <label className="input-label">{label}</label>}
            <input
                className={classNames('input-field', { 'input-error': error }, className)}
                {...props}
            />
            {error && <span className="input-error-msg">{error}</span>}
        </div>
    );
};

export default Input;
