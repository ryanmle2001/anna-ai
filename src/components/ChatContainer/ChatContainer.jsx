import React, { useEffect, useRef } from 'react';
import Message from '../Message/Message';
import ProductResults from '../ProductResults/ProductResults';
import TypingIndicator from '../TypingIndicator/TypingIndicator';
import './ChatContainer.css';

const ChatContainer = ({ messages, isTyping }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    console.log('Messages updated:', messages);
  }, [messages]);

  return (
    <div className="chat-container" ref={containerRef}>
      {messages.map((message, index) => {
        return (
          <div key={index}>
            <Message
              text={message.text}
              type={message.type}
              timestamp={message.timestamp}
            />
            {message.products && (
              <div>
                <ProductResults products={message.products} />
              </div>
            )}
          </div>
        );
      })}
      {isTyping && <TypingIndicator />}
    </div>
  );
};

export default ChatContainer; 