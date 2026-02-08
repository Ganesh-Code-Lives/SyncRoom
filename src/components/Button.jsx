import React from 'react';
import classNames from 'classnames';
import './Button.css';

const Button = ({
    children,
    variant = 'primary', // primary, secondary, danger, ghost
    size = 'md', // sm, md, lg
    fullWidth = false,
    className,
    ...props
}) => {
    return (
        <button
            className={classNames(
                'btn',
                `btn-${variant}`,
                `btn-${size}`,
                { 'btn-full': fullWidth },
                className
            )}
            {...props}
        >
            {children}
        </button>
    );
};

export default Button;
