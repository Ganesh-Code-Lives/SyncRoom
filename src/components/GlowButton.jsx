import React from 'react';
import classNames from 'classnames';
import { motion } from 'framer-motion';
import './GlowButton.css';

const GlowButton = ({
    children,
    variant = 'primary', // primary, secondary, danger, ghost
    size = 'md', // sm, md, lg
    fullWidth = false,
    className,
    onClick,
    disabled,
    ...props
}) => {
    return (
        <motion.button
            className={classNames(
                'glow-btn',
                `glow-btn-${variant}`,
                `glow-btn-${size}`,
                { 'glow-btn-full': fullWidth },
                className
            )}
            onClick={onClick}
            disabled={disabled}
            whileHover={!disabled ? { scale: 1.02, textShadow: "0 0 8px rgb(255,255,255)" } : {}}
            whileTap={!disabled ? { scale: 0.98 } : {}}
            {...props}
        >
            {/* Glow effect background */}
            {variant === 'primary' && <span className="btn-glow-bg"></span>}
            <span className="btn-content">{children}</span>
        </motion.button>
    );
};

export default GlowButton;
