import { html } from '../modules/sinuous/index.js'

const HelloMessage = ({ name }) => html`
  <h1 class="title text-4">Hello SPAXYYY</h1>
`

export const Home = () => html`
  <${HelloMessage} name=World />
`
