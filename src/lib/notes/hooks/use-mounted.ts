// extracted from Notea (MIT License)
import { useEffect, useState } from 'react';

const useMounted = () => {
    const [mounted] = useState(true);
    return mounted;
};

export default useMounted;
