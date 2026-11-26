import { mount } from 'svelte';
import App from './App.svelte';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/global.css';

// The overlay is not a web page: no browser context menu anywhere.
window.addEventListener('contextmenu', (e) => e.preventDefault());

export default mount(App, { target: document.getElementById('app')! });
