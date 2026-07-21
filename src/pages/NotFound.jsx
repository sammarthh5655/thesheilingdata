import { Link } from 'react-router-dom'
import EmptyState from '../components/EmptyState.jsx'

export default function NotFound() {
  return (
    <EmptyState glyph="∅" title="Page not found">
      That page doesn't exist. <Link to="/">Back to home</Link>
    </EmptyState>
  )
}
