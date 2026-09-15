import './style.css';

const status = document.querySelector('#build-status');

status.addEventListener('click', () => {
  status.textContent = status.textContent.includes('NOISE')
    ? 'LOUDER THAN WORDS'
    : 'READY TO MAKE SOME NOISE';
});
