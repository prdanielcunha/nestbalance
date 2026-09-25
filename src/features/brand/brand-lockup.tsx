export function BrandLockup({compact=false,className=''}:{compact?:boolean;className?:string}) {
  const rootClass=['brand-lockup',compact?'brand-lockup--compact':'brand-lockup--full',className].filter(Boolean).join(' ');
  const darkSrc=compact?'/brand/symbol-color.svg':'/brand/logo-horizontal-dark-bg.svg';
  const lightSrc=compact?'/brand/symbol-dark.svg':'/brand/logo-horizontal-light-bg.svg';
  return <span className={rootClass} aria-hidden="true">
    <img className="brand-lockup__dark" src={darkSrc} alt="" />
    <img className="brand-lockup__light" src={lightSrc} alt="" />
  </span>;
}
