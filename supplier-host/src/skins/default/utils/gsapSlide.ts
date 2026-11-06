import gsap from 'gsap';

type SlideDirection = 'top' | 'bottom' | 'left' | 'right' | 'center';

interface SlideOptions {
    direction?: SlideDirection;
    duration?: number;
    scale?: boolean;
    scaleFrom?: number;
    distance?: number;
    x?: string;
    y?: string;
    onShowComplete?: () => void;
    onHideComplete?: () => void;
}

export function createSlideAnimation(el: HTMLElement | null, options: SlideOptions = {}) {
    const {
        direction = 'bottom',
        duration = 0.2,
        scale = true,
        scaleFrom = 0.9,
        distance = 100,
        x,
        y,
        onShowComplete,
        onHideComplete
    } = options;

    if (!el) {
        return { show: () => {}, hide: () => {} };
    }

    // 动画状态管理
    let isAnimating = false;
    let currentTween: gsap.core.Tween | null = null;

    const setTransformOrigin = () => {
        if (x === undefined && y === undefined) return;
        const originX = x ?? 'center';
        const originY = y ?? 'center';
        el.style.transformOrigin = `${originX} ${originY}`;
    };

    const show = () => {
        // 如果正在隐藏动画中，先杀掉
        if (currentTween) {
            currentTween.kill();
            currentTween = null;
        }

        // 如果已经显示且不在动画中，直接返回
        if (el.style.display === 'block' && !isAnimating) return;

        isAnimating = true;

        const fromProps: gsap.TweenVars = { opacity: 0 };
        const toProps: gsap.TweenVars = {
            opacity: 1,
            duration,
            ease: 'power3.out',
            onComplete: () => {
                isAnimating = false;
                currentTween = null;
                onShowComplete?.();
            }
        };

        if (scale) {
            fromProps.scale = scaleFrom;
            toProps.scale = 1;
        }

        switch (direction) {
            case 'top':
                fromProps.y = -distance;
                toProps.y = 0;
                break;
            case 'bottom':
                fromProps.y = distance;
                toProps.y = 0;
                break;
            case 'left':
                fromProps.x = -distance;
                toProps.x = 0;
                break;
            case 'right':
                fromProps.x = distance;
                toProps.x = 0;
                break;
            case 'center':
                break;
        }

        setTransformOrigin();

        // 先设置为 block，但保持不可见，让 GSAP 能正确计算
        el.style.display = 'block';
        el.style.opacity = '0';

        currentTween = gsap.fromTo(el, fromProps, toProps);
    };

    const hide = (callback?: () => void) => {
        // 如果正在显示动画中，先杀掉
        if (currentTween) {
            currentTween.kill();
            currentTween = null;
        }

        // 如果已经是隐藏状态，直接执行回调
        if (el.style.display === 'none') {
            callback?.();
            onHideComplete?.();
            return;
        }

        isAnimating = true;

        const toProps: gsap.TweenVars = {
            opacity: 0,
            duration,
            ease: 'power2.in',
            onComplete: () => {
                el.style.display = 'none';
                isAnimating = false;
                currentTween = null;
                callback?.();
                onHideComplete?.();
            }
        };

        if (scale) {
            toProps.scale = scaleFrom;
        }

        switch (direction) {
            case 'top':
                toProps.y = -distance;
                break;
            case 'bottom':
                toProps.y = distance;
                break;
            case 'left':
                toProps.x = -distance;
                break;
            case 'right':
                toProps.x = distance;
                break;
            case 'center':
                break;
        }

        setTransformOrigin();

        currentTween = gsap.to(el, toProps);
    };

    return { show, hide };
}