import { createRoot } from 'react-dom/client';
import { MediaPermissionPage } from '../shared/MediaPermissionPage';
import '../tailwind.css';
import '@webskill/ui-kit/ui-kit.css';

createRoot(document.getElementById('root')!).render(<MediaPermissionPage kind="camera" />);
