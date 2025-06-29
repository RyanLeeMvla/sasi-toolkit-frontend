import React from 'react';
import './ProgressBar.css';

const ProgressBar = ({ progress, isLoading }) => {
  return (
    <div className="progress-container">
      <div
        className={`progress-fill ${isLoading ? 'shimmer' : ''}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

export default ProgressBar;
