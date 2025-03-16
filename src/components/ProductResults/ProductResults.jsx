import React from 'react';
import './ProductResults.css';

const ProductResults = ({ products }) => {
  console.log('ProductResults received products:', products);

  if (!products || products.length === 0) {
    console.log('No products to display');
    return null;
  }

  return (
    <div className="product-results">
      {products.map((product, index) => {
        console.log('Rendering product:', product);
        return (
          <a 
            key={product.asin || index} 
            className="product-card" 
            href={product.url} 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <img 
              src={product.image} 
              alt={product.title} 
              className="product-image" 
              onError={(e) => {
                console.log('Image load error for:', product.title);
                e.target.src = 'https://via.placeholder.com/100x100?text=No+Image';
              }}
            />
            <div className="product-info">
              <h3 className="product-title">
                {product.title}
              </h3>
              <div className="product-price">
                {product.price}
              </div>
              {product.rating && (
                <div className="product-rating">
                  <span className="stars">{'★'.repeat(Math.round(product.rating))}</span>
                  <span className="rating-text">
                    {product.rating.toFixed(1)} ({product.reviewCount.toLocaleString()} reviews)
                  </span>
                </div>
              )}
              {product.isPrime && (
                <div className="prime-badge">
                  Prime
                </div>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
};

export default ProductResults; 