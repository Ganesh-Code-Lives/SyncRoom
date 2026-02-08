import React from 'react';
import classNames from 'classnames';
import { motion } from 'framer-motion';
import './GlassCard.css';

const GlassCard = ({ children, className, hover = false, ...props }) => {
    return (
        <motion.div
            className={classNames('glass-card', { 'glass-card-hover': hover }, className)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.175, 0.885, 0.32, 1.275] }}
            {...props}
        >
            {children}
        </motion.div>
    );
};

export default GlassCard;
